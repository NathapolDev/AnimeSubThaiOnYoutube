const fs = require('node:fs/promises');
const path = require('node:path');
const { episodeNumber, isEpisode, youtubeJson } = require('./update-youtube');
const { catalogYears } = require('./update-jikan');
const { writeDataFiles } = require('./write-data');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const JSON_PATH = path.join(DATA_DIR, 'anime.json');
const CHANNELS_PATH = path.join(DATA_DIR, 'youtube-channels.json');
const STATE_PATH = path.join(DATA_DIR, 'youtube-discovery-state.json');
const CANDIDATES_PATH = path.join(DATA_DIR, 'youtube-candidates.json');
const API_ROOT = 'https://www.googleapis.com/youtube/v3';
const MAX_INCREMENTAL_PAGES = 20;

const normalizeTitle = value => String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// Accept a single year or a window array; always return a non-empty array of years.
const toYearList = years => (Array.isArray(years) ? years : [years]).filter(Number.isInteger);

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

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function youtubeRequest(resource, params, apiKey) {
  const query = new URLSearchParams({ ...params, key: apiKey });
  return youtubeJson(`${API_ROOT}/${resource}?${query}`);
}

async function resolveChannel(config, apiKey, requester = youtubeRequest) {
  const body = await requester('channels', { part: 'snippet,contentDetails', forHandle: config.handle.replace(/^@/, '') }, apiKey);
  const channel = body.items?.[0];
  if (!channel) throw new Error(`YouTube channel not found: ${config.handle}`);
  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title || config.label,
    uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || ''
  };
}

async function fetchChannelUploads(channel, previousState, years, backfill, apiKey, requester = youtubeRequest) {
  const yearList = toYearList(years);
  const yearSet = new Set(yearList);
  const minYear = Math.min(...yearList);
  const videos = [];
  let pageToken = '', pages = 0, reachedBoundary = false;
  const stopVideoId = !backfill && previousState?.year === minYear ? previousState.lastSeenVideoId : '';
  const fullScan = backfill || !stopVideoId;
  do {
    const body = await requester('playlistItems', {
      part: 'snippet,contentDetails', maxResults: '50', playlistId: channel.uploadsPlaylistId, ...(pageToken ? { pageToken } : {})
    }, apiKey);
    pages += 1;
    for (const item of body.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '';
      if (stopVideoId && videoId === stopVideoId) { reachedBoundary = true; break; }
      const publishedAt = item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || '';
      const publishedYear = publishedAt ? Number(publishedAt.slice(0, 4)) : minYear;
      if (publishedYear < minYear) { reachedBoundary = true; break; }
      if (yearSet.has(publishedYear)) videos.push({ videoId, title: item.snippet?.title || '', publishedAt });
    }
    pageToken = body.nextPageToken || '';
    if (reachedBoundary || (!fullScan && pages >= MAX_INCREMENTAL_PAGES)) break;
  } while (pageToken);
  return { videos, newestVideoId: videos[0]?.videoId || stopVideoId || '', pages, reachedBoundary };
}

function aliasesForAnime(item) {
  return [item.titleThai, item.titleOriginal, ...(String(item.altTitle || '').split('/')), ...(item.youtubeAliases || [])]
    .map(normalizeTitle).filter(alias => alias.length >= 6);
}

function matchVideoToAnime(video, anime) {
  const normalizedVideo = normalizeTitle(video.title);
  const scored = [];
  for (const item of anime) {
    const best = aliasesForAnime(item).filter(alias => normalizedVideo.includes(alias)).sort((a, b) => b.length - a.length)[0];
    if (best) scored.push({ item, score: best.length, alias: best });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return { match: null, candidates: [] };
  const leaders = scored.filter(value => value.score === scored[0].score);
  return leaders.length === 1 ? { match: leaders[0].item, candidates: leaders } : { match: null, candidates: leaders };
}

function mergeEpisodes(existing, additions) {
  const byId = new Map((existing || []).map(episode => [episode.videoId, episode]));
  for (const episode of additions) if (!byId.has(episode.videoId)) byId.set(episode.videoId, episode);
  return [...byId.values()].sort((a, b) => {
    if (a.number !== null && b.number !== null) return b.number - a.number || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

function applyDiscoveries(anime, channel, videos, candidatesLog, years = catalogYears()) {
  const yearList = toYearList(years);
  const yearSet = new Set(yearList);
  const minYear = Math.min(...yearList);
  const eligible = anime.filter(item => item.jikanType === 'TV' && !item.playlistId && yearSet.has(Number(item.catalogYear || item.year) || minYear));
  const grouped = new Map();
  for (const video of videos) {
    const number = episodeNumber(video.title);
    if (!video.videoId || number === null || !isEpisode(video.title)) continue;
    const result = matchVideoToAnime(video, eligible);
    if (!result.match) {
      if (result.candidates.length) candidatesLog.push({
        videoId: video.videoId, title: video.title, channel: channel.channelTitle,
        matches: result.candidates.map(value => ({ id: value.item.id, alias: value.alias, score: value.score }))
      });
      continue;
    }
    const list = grouped.get(result.match.id) || [];
    list.push({ number, title: video.title, videoId: video.videoId, videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`, publishedAt: video.publishedAt });
    grouped.set(result.match.id, list);
  }

  for (const item of eligible) {
    const additions = grouped.get(item.id);
    if (!additions?.length) continue;
    item.availableEpisodes = mergeEpisodes(item.youtubeSourceType === 'channel_uploads' ? item.availableEpisodes : [], additions);
    const latest = item.availableEpisodes[0];
    item.currentEpisode = latest.number;
    item.latestEpisodeTitle = latest.title;
    item.latestVideoUrl = latest.videoUrl;
    item.latestPublishedAt = latest.publishedAt;
    item.lastCheckedAt = new Date().toISOString();
    item.status = 'available'; item.updateStatus = 'ok'; item.updateError = '';
    item.confidence = 'confirmed_from_official_channel_uploads'; item.youtubeMatchConfidence = 'strong_unique_title_match';
    item.youtubeSourceType = 'channel_uploads'; item.youtubeChannelId = channel.channelId; item.youtubeChannelTitle = channel.channelTitle;
    item.channel = channel.label; item.platform = 'YouTube';
  }
  return grouped.size;
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY. Set it before running YouTube discovery.');
  const years = resolveYears();
  const windowYear = Math.min(...years); // incremental-state identity; stable across the New Year
  const backfill = process.argv.includes('--backfill') || process.env.BACKFILL === 'true';
  const [anime, configs, state] = await Promise.all([
    readJson(JSON_PATH, []), readJson(CHANNELS_PATH, []), readJson(STATE_PATH, { year: windowYear, channels: {} })
  ]);
  if (state.year !== windowYear) { state.year = windowYear; state.channels = {}; }
  const candidates = [];
  let matchedAnime = 0;
  for (const config of configs) {
    try {
      const resolved = await resolveChannel(config, apiKey);
      const channel = { ...resolved, ...config };
      const result = await fetchChannelUploads(channel, state.channels[config.handle], years, backfill, apiKey);
      matchedAnime += applyDiscoveries(anime, channel, result.videos, candidates, years);
      state.channels[config.handle] = {
        channelId: channel.channelId, uploadsPlaylistId: channel.uploadsPlaylistId,
        lastSeenVideoId: result.newestVideoId, lastCheckedAt: new Date().toISOString(), year: windowYear
      };
    } catch (error) {
      console.error(`[${config.handle}] ${error.message}`);
      state.channels[config.handle] = { ...(state.channels[config.handle] || {}), lastError: error.message };
    }
  }
  await writeDataFiles(anime);
  await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.writeFile(CANDIDATES_PATH, `${JSON.stringify(candidates, null, 2)}\n`, 'utf8');
  console.log(`YouTube discovery complete: ${matchedAnime} anime updated, ${candidates.length} ambiguous candidates.`);
}

if (require.main === module) main().catch(error => { console.error(`YouTube discovery failed: ${error.message}`); process.exitCode = 1; });

module.exports = { aliasesForAnime, applyDiscoveries, fetchChannelUploads, matchVideoToAnime, mergeEpisodes, normalizeTitle, resolveChannel, resolveYears };
