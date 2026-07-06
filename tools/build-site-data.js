const fs = require('node:fs/promises');
const path = require('node:path');

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

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, '_site', 'data'));
  const items = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const slim = slimItems(items);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'anime.js'), `window.ANIME_DATA = ${JSON.stringify(slim)};\n`, 'utf8');
  await fs.writeFile(path.join(outDir, 'anime.json'), `${JSON.stringify(slim)}\n`, 'utf8');
  console.log(`Site data built: ${items.length} entries -> ${path.relative(ROOT, outDir)}`);
}

if (require.main === module) main().catch(error => { console.error(`Site data build failed: ${error.message}`); process.exitCode = 1; });

module.exports = { slimItems };
