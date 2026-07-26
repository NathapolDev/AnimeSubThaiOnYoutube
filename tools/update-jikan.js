const fs = require('node:fs/promises');
const path = require('node:path');

const { writeDataFiles } = require('./write-data');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const API_ROOT = 'https://api.jikan.moe/v4';
const SEASONS = ['winter', 'spring', 'summer', 'fall'];
const seasonFromMonth = month => SEASONS[Math.floor((month - 1) / 3)];
const UPCOMING_SEASON_FROM_MONTH = 10; // Oct: the upcoming Winter (next year) starts ramping up
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const slugify = value => normalize(value).replace(/\s+/g, '-').slice(0, 80) || `anime-${Date.now()}`;
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
const JIKAN_DAYS = { Sundays: 0, Mondays: 1, Tuesdays: 2, Wednesdays: 3, Thursdays: 4, Fridays: 5, Saturdays: 6 };

function bangkokYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date));
}

function bangkokMonth(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Bangkok' }).format(date));
}

// Catalog years currently in play. Symmetric around the New Year so cross-boundary
// subbing (Winter premieres uploaded in late December, previous-cour shows finishing
// in early January) is never missed.
function catalogYears(date = new Date()) {
  const year = bangkokYear(date);
  const month = bangkokMonth(date);
  if (month >= UPCOMING_SEASON_FROM_MONTH) return [year, year + 1]; // upcoming Winter ramping up
  if (month <= 2) return [year - 1, year];                          // prior-year shows still finishing
  return [year];
}

function thaiBroadcastTime(broadcast = {}) {
  const dayIndex = JIKAN_DAYS[broadcast.day];
  const match = String(broadcast.time || '').match(/^(\d{1,2}):(\d{2})/);
  if (dayIndex === undefined || !match) return '';
  let minutes = Number(match[1]) * 60 + Number(match[2]) - 120;
  let thaiDay = dayIndex;
  if (minutes < 0) { minutes += 1440; thaiDay = (thaiDay + 6) % 7; }
  return `${THAI_DAYS[thaiDay]} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Node's fetch has no default timeout, so a connection the proxy never closes would
// hang the whole run; 429 is worth waiting out, but a 504 means Jikan itself could not
// reach MyAnimeList (routine for brand-new entries) and rarely recovers within seconds.
const REQUEST_TIMEOUT_MS = 20000;
const RATE_LIMIT_ATTEMPTS = 5;
const SERVER_ERROR_ATTEMPTS = 3;

async function requestJson(url, attempt = 1) {
  let response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'anime-year-youtube-tracker/2.0' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (attempt >= SERVER_ERROR_ATTEMPTS) throw new Error(`Jikan API request failed: ${error.message}`);
    await wait(1000 * attempt);
    return requestJson(url, attempt + 1);
  }
  const retryLimit = response.status === 429 ? RATE_LIMIT_ATTEMPTS : SERVER_ERROR_ATTEMPTS;
  if ((response.status === 429 || response.status >= 500) && attempt < retryLimit) {
    await wait(1000 * attempt);
    return requestJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`Jikan API returned HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function fetchSeason(year, season, requester = requestJson) {
  const byMalId = new Map();
  let page = 1;
  while (true) {
    const body = await requester(`${API_ROOT}/seasons/${year}/${season}?sfw=true&page=${page}`);
    for (const anime of body.data || []) if (anime.type === 'TV') byMalId.set(anime.mal_id, anime);
    if (!body.pagination?.has_next_page) break;
    page += 1;
    await wait(450);
  }
  return [...byMalId.values()];
}

async function fetchYear(year, requester = requestJson) {
  const byMalId = new Map();
  for (const season of SEASONS) {
    try {
      for (const anime of await fetchSeason(year, season, requester)) byMalId.set(anime.mal_id, { anime, season });
    } catch (error) {
      console.error(`[Jikan ${year}/${season}] ${error.message}`);
    }
    await wait(450);
  }
  return [...byMalId.values()];
}

async function fetchCatalog(date = new Date(), requester = requestJson) {
  const year = bangkokYear(date);
  const byMalId = new Map();
  for (const entry of await fetchYear(year, requester)) byMalId.set(entry.anime.mal_id, entry);
  if (bangkokMonth(date) >= UPCOMING_SEASON_FROM_MONTH) {
    try {
      for (const anime of await fetchSeason(year + 1, 'winter', requester)) {
        byMalId.set(anime.mal_id, { anime, season: 'winter' });
      }
    } catch (error) {
      console.error(`[Jikan ${year + 1}/winter] ${error.message}`);
    }
  }
  return [...byMalId.values()];
}

function findExisting(items, anime) {
  const byId = items.find(item => item.malId === anime.mal_id);
  if (byId) return byId;
  const candidates = new Set([anime.title, anime.title_english, ...(anime.titles || []).map(item => item.title)].map(normalize).filter(Boolean));
  return items.find(item => !item.malId && item.confidence !== 'imported_from_jikan' && [item.titleOriginal, item.altTitle, item.titleThai].map(normalize).some(title => candidates.has(title)));
}

function jikanFields(anime, season, year) {
  return {
    malId: anime.mal_id, malUrl: anime.url || '', jikanType: anime.type || '', jikanStatus: anime.status || '',
    rating: anime.rating || '', score: anime.score || 0, season, year: anime.year || year,
    catalogYear: anime.year || year, trailerUrl: anime.trailer?.url || ''
  };
}

function enrichExisting(item, anime, season, year) {
  Object.assign(item, jikanFields(anime, season, year));
  item.poster = anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || item.poster;
  item.studio = anime.studios?.map(studio => studio.name).join(' / ') || item.studio;
  item.source = anime.source || item.source;
  if ((!item.episodes || item.episodes === '?') && anime.episodes) item.episodes = String(anime.episodes);
  if (!item.summary && anime.synopsis) item.summary = anime.synopsis;
  if ((!item.genres || !item.genres.length) && anime.genres) item.genres = anime.genres.map(genre => genre.name);
  if (anime.aired?.from) item.premiere = anime.aired.from;
  if (anime.status === 'Finished Airing' && !thaiBroadcastTime(anime.broadcast)) {
    item.airTimeThai = 'รอประกาศเวลาไทย';
  } else if (!item.airTimeThai || item.airTimeThai === 'รอประกาศเวลาไทย') {
    item.airTimeThai = thaiBroadcastTime(anime.broadcast) || 'รอประกาศเวลาไทย';
  }
  item.youtubeAliases ??= [];
  item.youtubeSourceType ??= item.playlistId ? 'playlist' : '';
  item.youtubeChannelId ??= '';
  item.youtubeChannelTitle ??= '';
  item.youtubeMatchConfidence ??= '';
  item.availableEpisodes ??= [];
}

function createItem(anime, season, year, usedIds) {
  const title = anime.title_english || anime.title;
  let id = slugify(anime.title);
  if (usedIds.has(id)) id = `${id}-${anime.mal_id}`;
  usedIds.add(id);
  return {
    id, titleThai: title, titleOriginal: anime.title || title,
    altTitle: (anime.titles || []).map(item => item.title).filter(value => value && value !== anime.title && value !== title).slice(0, 3).join(' / '),
    studio: anime.studios?.map(studio => studio.name).join(' / ') || 'ไม่ระบุ', source: anime.source || 'ไม่ระบุ',
    episodes: anime.episodes ? String(anime.episodes) : '?', premiere: anime.aired?.from || '',
    airTimeThai: thaiBroadcastTime(anime.broadcast) || 'รอประกาศเวลาไทย', channel: 'ยังไม่ประกาศช่องทางไทย', platform: 'ยังไม่ประกาศ',
    status: 'upcoming', confidence: 'imported_from_jikan', link: anime.url || '',
    genres: [...(anime.genres || []), ...(anime.themes || []), ...(anime.demographics || [])].map(item => item.name),
    summary: anime.synopsis || 'ยังไม่มีเรื่องย่อจาก Jikan', note: `นำเข้าจาก Jikan ${season} ${year}; ยังไม่ได้ยืนยันช่องทางรับชมซับไทยบน YouTube`,
    poster: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || '',
    playlistId: '', currentEpisode: 0, latestEpisodeTitle: '', latestVideoUrl: '', latestPublishedAt: '', lastCheckedAt: '',
    updateStatus: 'no_playlist', updateError: '', availableEpisodes: [], youtubeAliases: [], youtubeSourceType: '',
    youtubeChannelId: '', youtubeChannelTitle: '', youtubeMatchConfidence: '',
    ...jikanFields(anime, season, year)
  };
}

// Jikan caches the season listing hard, so the `score` it hands back drifts from
// MyAnimeList by up to ~0.2 — enough to order the season Top 10 wrongly. The per-anime
// endpoint is cached far more briefly (observed within ~0.02 of the MAL page, against
// ~0.08 for the listing), so every anime whose ranking can still move gets one
// follow-up request after the catalog sync. Neither endpoint is live: exact parity
// with MyAnimeList would mean going to its official API with a client id.
const SCORE_REFRESH_DELAY_MS = 1100;              // Jikan allows 60 requests/minute
const SCORE_REFRESH_BUDGET_MS = 8 * 60 * 1000;    // one slow pass must not eat the workflow's 30-minute budget
const SCORE_REFRESH_MAX_FAILURES = 25;            // Jikan 504s come in bursts; this many in a row means MyAnimeList is simply down

function needsScoreRefresh(item, years, season) {
  return item.jikanType === 'TV' && Boolean(item.malId)
    && years.includes(Number(item.catalogYear || item.year))
    && (item.season === season || item.jikanStatus !== 'Finished Airing');
}

async function fetchAnimeById(malId, requester = requestJson) {
  return (await requester(`${API_ROOT}/anime/${malId}`)).data;
}

// Highest scores first so a pass cut short by the budget or the failure breaker
// has still refreshed everything that can plausibly land in the season Top 10.
async function refreshScores(items, { date = new Date(), requester = requestJson, delay = SCORE_REFRESH_DELAY_MS, budgetMs = SCORE_REFRESH_BUDGET_MS, now = () => Date.now() } = {}) {
  const years = catalogYears(date);
  const season = seasonFromMonth(bangkokMonth(date));
  const targets = items.filter(item => needsScoreRefresh(item, years, season)).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const deadline = now() + budgetMs;
  let refreshed = 0, failed = 0, consecutiveFailures = 0, stopped = '';
  for (const [index, item] of targets.entries()) {
    if (now() >= deadline) { stopped = 'time budget'; break; }
    if (consecutiveFailures >= SCORE_REFRESH_MAX_FAILURES) { stopped = 'repeated request failures'; break; }
    if (index) await wait(delay);
    let anime;
    // A failed request must leave the stored score alone: writing 0 would drop the
    // anime out of the ranking entirely (app.js keeps only score > 0).
    try { anime = await fetchAnimeById(item.malId, requester); }
    catch (error) { failed += 1; consecutiveFailures += 1; console.error(`[Jikan anime/${item.malId}] ${error.message}`); continue; }
    // Jikan can answer 200 with an error envelope instead of an anime while MyAnimeList
    // is struggling, so a missing payload counts as a failure rather than an empty score.
    if (!anime) { failed += 1; consecutiveFailures += 1; console.error(`[Jikan anime/${item.malId}] response carried no anime data`); continue; }
    consecutiveFailures = 0;
    item.score = anime.score || 0;
    item.jikanStatus = anime.status || item.jikanStatus;
    if ((!item.episodes || item.episodes === '?') && anime.episodes) item.episodes = String(anime.episodes);
    refreshed += 1;
  }
  if (stopped) console.error(`[Jikan score refresh] stopped early: ${stopped}`);
  return { targets: targets.length, refreshed, failed, stopped };
}

async function syncCatalog(items, year, entries) {
  const usedIds = new Set(items.map(item => item.id));
  let enriched = 0, added = 0;
  for (const { anime, season } of entries) {
    const existing = findExisting(items, anime);
    if (existing) { enrichExisting(existing, anime, season, year); enriched += 1; }
    else { items.push(createItem(anime, season, year, usedIds)); added += 1; }
  }
  return { enriched, added };
}

async function main() {
  const year = bangkokYear();
  const items = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const result = await syncCatalog(items, year, await fetchCatalog());
  const scores = await refreshScores(items);
  await writeDataFiles(items);
  console.log(`Jikan ${year} TV sync: ${result.enriched} enriched, ${result.added} added, ${items.length} archived total.`);
  console.log(`Live score refresh: ${scores.refreshed}/${scores.targets} updated, ${scores.failed} failed${scores.stopped ? ` (stopped early: ${scores.stopped})` : ''}.`);
}

if (require.main === module) main().catch(error => { console.error(`Jikan update failed: ${error.message}`); process.exitCode = 1; });

module.exports = { UPCOMING_SEASON_FROM_MONTH, bangkokMonth, bangkokYear, catalogYears, createItem, fetchAnimeById, fetchCatalog, fetchSeason, fetchYear, findExisting, needsScoreRefresh, refreshScores, requestJson, seasonFromMonth, syncCatalog, thaiBroadcastTime };
