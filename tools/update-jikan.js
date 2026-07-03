const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const JS_PATH = path.join(ROOT, 'data', 'anime.js');
const API_ROOT = 'https://api.jikan.moe/v4';
const SEASONS = ['winter', 'spring', 'summer', 'fall'];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const slugify = value => normalize(value).replace(/\s+/g, '-').slice(0, 80) || `anime-${Date.now()}`;
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
const JIKAN_DAYS = { Sundays: 0, Mondays: 1, Tuesdays: 2, Wednesdays: 3, Thursdays: 4, Fridays: 5, Saturdays: 6 };

function bangkokYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date));
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

async function requestJson(url, attempt = 1) {
  const response = await fetch(url, { headers: { 'User-Agent': 'anime-year-youtube-tracker/2.0' } });
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
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
  const result = await syncCatalog(items, year, await fetchYear(year));
  const json = `${JSON.stringify(items, null, 2)}\n`;
  await fs.writeFile(JSON_PATH, json, 'utf8');
  await fs.writeFile(JS_PATH, `window.ANIME_DATA = ${json}`, 'utf8');
  console.log(`Jikan ${year} TV sync: ${result.enriched} enriched, ${result.added} added, ${items.length} archived total.`);
}

if (require.main === module) main().catch(error => { console.error(`Jikan update failed: ${error.message}`); process.exitCode = 1; });

module.exports = { bangkokYear, fetchSeason, fetchYear, syncCatalog, thaiBroadcastTime };
