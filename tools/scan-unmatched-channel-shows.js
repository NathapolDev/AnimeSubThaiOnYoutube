const fs = require('node:fs/promises');
const path = require('node:path');
const { isEpisode } = require('./update-youtube');
const { catalogYears } = require('./update-jikan');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const CHANNELS_PATH = path.join(ROOT, 'data', 'youtube-channels.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'thai-title-candidates.json');
const API_ROOT = 'https://www.googleapis.com/youtube/v3';
const RECENT_DAYS = 60;
const MAX_EPISODES_PER_SHOW = 100;

const normalizeTitle = value => String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// Resolve the catalog-year window: automatic (current + adjacent season year near the New Year),
// or an explicit override via --year 2027 / --years 2026,2027.
function resolveYears(argv = process.argv) {
  const flag = argv.find(arg => arg.startsWith('--year=') || arg.startsWith('--years='));
  const value = flag ? flag.split('=')[1] : (() => {
    const index = argv.findIndex(arg => arg === '--year' || arg === '--years');
    return index !== -1 ? argv[index + 1] : '';
  })();
  const override = String(value || '').split(',').map(part => part.trim()).filter(Boolean).map(Number).filter(Number.isInteger);
  return override.length ? override : catalogYears();
}

async function req(resource, params, apiKey) {
  const query = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${API_ROOT}/${resource}?${query}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `YouTube API HTTP ${res.status}`);
  return body;
}

async function getUploadsPlaylistId(handle, apiKey) {
  const body = await req('channels', { part: 'contentDetails', forHandle: handle.replace(/^@/, '') }, apiKey);
  return body.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
}

async function getAllUploads(uploadsPlaylistId, years, apiKey) {
  const yearSet = new Set(years);
  const minYear = Math.min(...years);
  const videos = [];
  let pageToken = '', reachedBoundary = false;
  do {
    const body = await req('playlistItems', { part: 'snippet,contentDetails', maxResults: '50', playlistId: uploadsPlaylistId, ...(pageToken ? { pageToken } : {}) }, apiKey);
    for (const item of body.items || []) {
      const publishedAt = item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || '';
      const publishedYear = publishedAt ? Number(publishedAt.slice(0, 4)) : minYear;
      if (publishedYear < minYear) { reachedBoundary = true; break; }
      if (yearSet.has(publishedYear)) videos.push({ videoId: item.contentDetails?.videoId, title: item.snippet?.title || '', publishedAt });
    }
    pageToken = body.nextPageToken || '';
    if (reachedBoundary) break;
  } while (pageToken);
  return videos;
}

function extractShowName(title) {
  return title
    .split(/ตอนที่|EP\.?\s*\d|Episode\s*\d|#\d+/i)[0]
    .replace(/[\[【].*$/, '')
    .trim();
}

function aliasesForAnime(item) {
  return [item.titleThai, item.titleOriginal, ...(String(item.altTitle || '').split('/')), ...(item.youtubeAliases || [])]
    .map(normalizeTitle).filter(alias => alias.length >= 4);
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY. Set it before running this scan.');

  const years = resolveYears();
  const yearSet = new Set(years);
  const [anime, channels] = await Promise.all([
    fs.readFile(JSON_PATH, 'utf8').then(JSON.parse),
    fs.readFile(CHANNELS_PATH, 'utf8').then(JSON.parse)
  ]);

  const unmatched = anime.filter(a => a.jikanType === 'TV' && yearSet.has(Number(a.catalogYear || a.year)) && !a.availableEpisodes?.length);
  const matchedAliases = new Set();
  for (const item of anime) for (const alias of aliasesForAnime(item)) matchedAliases.add(alias);

  const allVideos = [];
  for (const channel of channels) {
    const uploadsId = await getUploadsPlaylistId(channel.handle, apiKey);
    const videos = await getAllUploads(uploadsId, years, apiKey);
    for (const v of videos) if (isEpisode(v.title)) allVideos.push({ ...v, channel: channel.label });
    console.error(`${channel.label}: ${videos.length} uploads scanned`);
  }

  const shows = new Map();
  for (const v of allVideos) {
    const name = extractShowName(v.title);
    if (!name || name.includes('ไฮไลท์') || name.includes('SHORTS') || name.includes('#')) continue;
    if (!shows.has(name)) shows.set(name, { channel: v.channel, count: 0, sample: v.title, latest: '' });
    const s = shows.get(name);
    s.count++;
    if (v.publishedAt > s.latest) s.latest = v.publishedAt;
  }

  const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000).toISOString();
  const candidates = [];
  for (const [name, info] of shows.entries()) {
    if (info.latest < cutoff || info.count > MAX_EPISODES_PER_SHOW) continue;
    const normName = normalizeTitle(name);
    const alreadyKnown = [...matchedAliases].some(alias => normName.includes(alias) || alias.includes(normName));
    if (alreadyKnown) continue;
    candidates.push({ showName: name, channel: info.channel, episodeCount: info.count, latestPublishedAt: info.latest, sampleTitle: info.sample });
  }
  candidates.sort((a, b) => b.latestPublishedAt.localeCompare(a.latestPublishedAt));

  const output = {
    generatedAt: new Date().toISOString(),
    years,
    unmatchedAnimeCount: unmatched.length,
    candidateShowCount: candidates.length,
    instructions: [
      'Each entry is a show name (extracted from real episode uploads) not yet linked to any anime.json entry.',
      'Cross-reference showName against unmatched anime titleOriginal/titleThai using translation knowledge.',
      'When confident of a match, add showName (or a distinctive substring) to that anime\'s youtubeAliases in anime.json.',
      'Then rerun: node tools/discover-youtube.js --backfill (with YOUTUBE_API_KEY set) to pull in the episodes.'
    ],
    candidates
  };
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Found ${candidates.length} unmatched show names (out of ${unmatched.length} anime still without episodes). Written to ${path.relative(ROOT, OUTPUT_PATH)}.`);
}

if (require.main === module) main().catch(error => { console.error(`Scan failed: ${error.message}`); process.exitCode = 1; });

module.exports = { extractShowName, aliasesForAnime, resolveYears };
