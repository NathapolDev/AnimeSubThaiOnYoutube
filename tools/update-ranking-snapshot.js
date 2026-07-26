const fs = require('node:fs/promises');
const path = require('node:path');

const { writeDataFiles } = require('./write-data');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'ranking-snapshot.json');
const SEASONS = ['winter', 'spring', 'summer', 'fall'];
const TOP_N = 10;

function bangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  const year = Number(get('year'));
  return { year, season: SEASONS[Math.floor((Number(get('month')) - 1) / 3)], date: `${get('year')}-${get('month')}-${get('day')}` };
}

// Deliberately the same predicate and ordering app.js renderSeasonRanking() uses:
// the browser still sorts the list itself, and the stored ranks only feed the
// day-over-day arrows, so the two must agree on what "rank 3" means.
function rankSeason(items, { year, season }) {
  return items
    .filter(item => item.jikanType === 'TV' && Number(item.catalogYear || item.year) === year && item.season === season && Number(item.score) > 0)
    .sort((a, b) => Number(b.score) - Number(a.score) || String(a.titleThai).localeCompare(String(b.titleThai), 'th'))
    .slice(0, TOP_N);
}

function emptySnapshot() {
  return { year: 0, season: '', date: '', ranks: {}, previous: { date: '', ranks: {} } };
}

// A baseline is only usable with both halves present, so a hand-edited or half-written
// state file degrades to "no baseline" instead of throwing mid-run.
function baseline(value) {
  const ranks = value && typeof value.ranks === 'object' && value.ranks ? value.ranks : {};
  const date = value && value.date ? String(value.date) : '';
  return date ? { date, ranks } : { date: '', ranks: {} };
}

// The pipeline runs three times a day, so the comparison baseline only rolls over
// when the Bangkok date changes — `previous` then holds yesterday's closing ranks
// and stays put for the rest of today. A new season starts from a clean slate
// because ranks from the previous season say nothing about this one.
function applySnapshot(items, stored, now = new Date()) {
  const { year, season, date } = bangkokParts(now);
  const base = stored && typeof stored === 'object' ? stored : emptySnapshot();
  const sameSeason = base.year === year && base.season === season;
  const previous = !sameSeason ? { date: '', ranks: {} }
    : base.date === date ? baseline(base.previous)
      : baseline({ date: base.date, ranks: base.ranks });

  const ranks = {};
  rankSeason(items, { year, season }).forEach((item, index) => { ranks[item.id] = index + 1; });
  for (const item of items) {
    const rank = ranks[item.id];
    if (!rank) { delete item.seasonRank; delete item.seasonRankPrevious; continue; }
    item.seasonRank = rank;
    // With no baseline (first run, or the first day of a season) there is nothing to
    // compare against: leaving the field off tells app.js to draw no arrow at all,
    // rather than badging all ten as brand-new entries.
    if (previous.date) item.seasonRankPrevious = Number(previous.ranks[item.id]) || 0;
    else delete item.seasonRankPrevious;
  }
  return { year, season, date, ranks, previous };
}

async function readSnapshot() {
  try { return JSON.parse(await fs.readFile(SNAPSHOT_PATH, 'utf8')); }
  catch { return emptySnapshot(); }
}

async function main() {
  const items = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const snapshot = applySnapshot(items, await readSnapshot());
  await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeDataFiles(items);
  const ranked = Object.keys(snapshot.ranks).length;
  const moved = items.filter(item => item.seasonRank && item.seasonRankPrevious && item.seasonRank !== item.seasonRankPrevious).length;
  console.log(`Ranking snapshot ${snapshot.season} ${snapshot.year} (${snapshot.date}): ${ranked} ranked, ${moved} moved since ${snapshot.previous.date || 'no earlier snapshot'}.`);
}

if (require.main === module) main().catch(error => { console.error(`Ranking snapshot failed: ${error.message}`); process.exitCode = 1; });

module.exports = { TOP_N, applySnapshot, bangkokParts, rankSeason };
