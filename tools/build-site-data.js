const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { availableEpisodeCount } = require('../progress.js');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');

// Every field app.js reads; anything else is pipeline bookkeeping the
// browser never needs and only inflates the page payload.
const ITEM_FIELDS = [
  'id', 'titleThai', 'titleOriginal', 'altTitle', 'studio', 'source', 'genres', 'summary', 'poster',
  'channel', 'platform', 'status', 'updateStatus', 'updateError', 'link', 'playlistId',
  'currentEpisode', 'episodes', 'latestVideoUrl', 'latestPublishedAt', 'lastCheckedAt',
  'malUrl', 'trailerUrl', 'score', 'season', 'year', 'catalogYear', 'jikanType', 'jikanStatus',
  'premiere', 'airTimeThai'
];
const EPISODE_FIELDS = ['number', 'title', 'videoUrl', 'publishedAt'];
// Crunchyroll/Bilibili/Netflix sub-objects get their own whitelists so pipeline
// bookkeeping (anilistId, rawNumber, numberingOffset) never reaches the browser.
const CR_FIELDS = ['seriesUrl', 'episodeCount', 'latestEpisodeNumber', 'lastCheckedAt', 'updateStatus'];
const CR_EPISODE_FIELDS = ['number', 'title', 'url'];
const BILI_FIELDS = ['seriesUrl', 'episodeCount', 'latestEpisodeNumber', 'lastCheckedAt', 'updateStatus'];
const BILI_EPISODE_FIELDS = ['number', 'title', 'url'];
const NETFLIX_FIELDS = ['seriesUrl', 'episodeCount', 'latestEpisodeNumber', 'lastCheckedAt', 'updateStatus'];
const NETFLIX_EPISODE_FIELDS = ['number', 'title', 'url'];

function pick(source, fields) {
  const out = {};
  for (const field of fields) if (source[field] !== undefined) out[field] = source[field];
  return out;
}

function slimItems(items) {
  return items.map(item => ({
    ...pick(item, ITEM_FIELDS),
    availableEpisodes: (item.availableEpisodes || []).map(episode => pick(episode, EPISODE_FIELDS)),
    ...(item.crunchyroll ? {
      crunchyroll: {
        ...pick(item.crunchyroll, CR_FIELDS),
        availableEpisodes: (item.crunchyroll.availableEpisodes || []).map(episode => pick(episode, CR_EPISODE_FIELDS))
      }
    } : {}),
    ...(item.bilibili ? {
      bilibili: {
        ...pick(item.bilibili, BILI_FIELDS),
        availableEpisodes: (item.bilibili.availableEpisodes || []).map(episode => pick(episode, BILI_EPISODE_FIELDS))
      }
    } : {}),
    ...(item.netflix ? {
      netflix: {
        ...pick(item.netflix, NETFLIX_FIELDS),
        availableEpisodes: (item.netflix.availableEpisodes || []).map(episode => pick(episode, NETFLIX_EPISODE_FIELDS))
      }
    } : {})
  }));
}

// The deployed payload is split so the first paint doesn't wait on detail-only
// data (summaries + every episode list — roughly half the bytes): the core file
// keeps everything cards/stats/schedule read, while the details file is lazily
// injected by app.js only after the first render. The core file advertises the
// details URL (content-hashed, so an unchanged details file stays cached) via
// window.ANIME_DETAILS_URL — its absence is how the unsplit repo data/anime.js
// tells app.js to skip the lazy path entirely on file://.
const PLATFORM_KEYS = ['crunchyroll', 'bilibili', 'netflix'];

function splitItems(slim) {
  const core = [];
  const details = {};
  for (const item of slim) {
    const { summary, availableEpisodes, ...coreItem } = item;
    coreItem.availableEpisodeCount = availableEpisodeCount(availableEpisodes);
    if (!coreItem.latestVideoUrl && availableEpisodes?.[0]?.videoUrl) coreItem.latestVideoUrl = availableEpisodes[0].videoUrl;
    const detail = {};
    if (summary) detail.summary = summary;
    if (availableEpisodes?.length) detail.availableEpisodes = availableEpisodes;
    for (const key of PLATFORM_KEYS) {
      if (!item[key]) continue;
      const { availableEpisodes: platformEpisodes, ...platformCore } = item[key];
      coreItem[key] = platformCore;
      if (platformEpisodes?.length) detail[key] = { availableEpisodes: platformEpisodes };
    }
    core.push(coreItem);
    if (Object.keys(detail).length) details[item.id] = detail;
  }
  return { core, details };
}

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, '_site', 'data'));
  const items = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const slim = slimItems(items);
  const { core, details } = splitItems(slim);
  const detailsJs = `window.ANIME_DETAILS = ${JSON.stringify(details)};\n`;
  const detailsHash = crypto.createHash('sha256').update(detailsJs).digest('hex').slice(0, 10);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'anime.js'), `window.ANIME_DATA = ${JSON.stringify(core)};window.ANIME_DETAILS_URL = 'data/anime-details.js?v=${detailsHash}';\n`, 'utf8');
  await fs.writeFile(path.join(outDir, 'anime-details.js'), detailsJs, 'utf8');
  await fs.writeFile(path.join(outDir, 'anime.json'), `${JSON.stringify(slim)}\n`, 'utf8');
  console.log(`Site data built: ${items.length} entries (${Object.keys(details).length} with details) -> ${path.relative(ROOT, outDir)}`);
}

if (require.main === module) main().catch(error => { console.error(`Site data build failed: ${error.message}`); process.exitCode = 1; });

module.exports = { slimItems, splitItems };
