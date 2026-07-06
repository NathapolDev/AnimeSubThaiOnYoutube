const fs = require('node:fs/promises');
const path = require('node:path');
const { episodeNumber, episodeRange, extractShowName, isEpisode, youtubeJson } = require('./update-youtube');
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

// Fuzzy (Tier 2) matching thresholds — Sørensen–Dice similarity over character
// bigrams of the normalized show name. Auto-apply only a clear, very-high-confidence
// winner; route medium-confidence or ambiguous matches to youtube-candidates.json
// for human review rather than silently linking the wrong show.
const AUTO_THRESHOLD = 0.72;    // >= this (and clearly ahead) auto-links the episode
const SUGGEST_THRESHOLD = 0.5;  // >= this but below auto → review suggestion only
const FUZZY_MARGIN = 0.08;      // top must beat the runner-up by this to be a clear winner

const normalizeTitle = value => String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// Character-bigram multiset of a string, used for the Dice coefficient below.
function bigrams(value) {
  const text = String(value || '');
  const grams = new Map();
  for (let index = 0; index < text.length - 1; index += 1) {
    const gram = text.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  return grams;
}

// Sørensen–Dice coefficient over character bigrams: 1 = identical, 0 = no shared
// bigram. Character-level (not word-level) so it works for Thai, which normalizeTitle
// cannot split into words. Callers pass already-normalized strings.
function diceSimilarity(a, b) {
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  const sizeA = [...gramsA.values()].reduce((sum, count) => sum + count, 0);
  const sizeB = [...gramsB.values()].reduce((sum, count) => sum + count, 0);
  if (!sizeA || !sizeB) return 0;
  let overlap = 0;
  for (const [gram, count] of gramsA) if (gramsB.has(gram)) overlap += Math.min(count, gramsB.get(gram));
  return (2 * overlap) / (sizeA + sizeB);
}

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
  const anilist = item.anilistTitles || {};
  return [
    item.titleThai, item.titleOriginal, ...(String(item.altTitle || '').split('/')), ...(item.youtubeAliases || []),
    anilist.romaji, anilist.english, anilist.native, ...(anilist.synonyms || [])
  ].map(normalizeTitle).filter(alias => alias.length >= 6);
}

// Two-tier matcher:
//   Tier 1 (exact): unique longest normalized alias that is a substring of the video
//     title — the original, high-precision path. Applied automatically.
//   Tier 2 (fuzzy): only when Tier 1 finds nothing. Dice-similarity of the extracted
//     show name against each anime's aliases. A clear winner >= AUTO_THRESHOLD is applied;
//     medium-confidence / ambiguous winners become review suggestions, never auto-linked.
// Returns { match, matchType: 'exact'|'fuzzy'|null, score, candidates, suggestions }.
function matchVideoToAnime(video, anime) {
  const normalizedVideo = normalizeTitle(video.title);
  const scored = [];
  for (const item of anime) {
    const best = aliasesForAnime(item).filter(alias => normalizedVideo.includes(alias)).sort((a, b) => b.length - a.length)[0];
    if (best) scored.push({ item, score: best.length, alias: best });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length) {
    const leaders = scored.filter(value => value.score === scored[0].score);
    return leaders.length === 1
      ? { match: leaders[0].item, matchType: 'exact', score: leaders[0].score, candidates: leaders, suggestions: [] }
      : { match: null, matchType: null, score: leaders[0].score, candidates: leaders, suggestions: [] };
  }

  const showName = normalizeTitle(extractShowName(video.title));
  if (showName.length < 6) return { match: null, matchType: null, score: 0, candidates: [], suggestions: [] };
  const fuzzy = [];
  for (const item of anime) {
    let best = 0, bestAlias = '';
    for (const alias of aliasesForAnime(item)) {
      const score = diceSimilarity(showName, alias);
      if (score > best) { best = score; bestAlias = alias; }
    }
    if (best >= SUGGEST_THRESHOLD) fuzzy.push({ item, score: best, alias: bestAlias });
  }
  fuzzy.sort((a, b) => b.score - a.score);
  if (!fuzzy.length) return { match: null, matchType: null, score: 0, candidates: [], suggestions: [] };
  const top = fuzzy[0];
  const clearWinner = top.score - (fuzzy[1]?.score ?? 0) >= FUZZY_MARGIN;
  if (top.score >= AUTO_THRESHOLD && clearWinner) {
    return { match: top.item, matchType: 'fuzzy', score: top.score, candidates: [], suggestions: [] };
  }
  const suggestions = clearWinner ? [top] : fuzzy.filter(value => value.score >= top.score - FUZZY_MARGIN);
  return { match: null, matchType: null, score: top.score, candidates: [], suggestions };
}

function mergeEpisodes(existing, additions) {
  const byId = new Map((existing || []).map(episode => [episode.videoId, episode]));
  for (const episode of additions) {
    const merged = { ...(byId.get(episode.videoId) || {}), ...episode };
    if (episode.startNumber === undefined || episode.endNumber === undefined) {
      delete merged.startNumber;
      delete merged.endNumber;
    }
    byId.set(episode.videoId, merged);
  }
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
  const eligible = anime.filter(item => item.jikanType === 'TV'
    && !item.playlistId
    && (item.youtubeSourceType !== 'channel_uploads' || item.youtubeChannelId === channel.channelId)
    && yearSet.has(Number(item.catalogYear || item.year) || minYear));
  const grouped = new Map();
  const matchTypeById = new Map();
  for (const video of videos) {
    const number = episodeNumber(video.title);
    if (!video.videoId || number === null || !isEpisode(video.title)) continue;
    const result = matchVideoToAnime(video, eligible);
    if (!result.match) {
      if (result.candidates.length) candidatesLog.push({
        type: 'ambiguous_title', videoId: video.videoId, title: video.title, channel: channel.channelTitle,
        matches: result.candidates.map(value => ({ id: value.item.id, alias: value.alias, score: value.score }))
      });
      for (const suggestion of result.suggestions) candidatesLog.push({
        type: 'fuzzy_suggestion', videoId: video.videoId, title: video.title, channel: channel.channelTitle,
        matches: [{ id: suggestion.item.id, alias: suggestion.alias, score: Number(suggestion.score.toFixed(3)) }]
      });
      continue;
    }
    // A show reached from a strong exact match keeps that provenance even if some of
    // its other episodes only matched fuzzily.
    matchTypeById.set(result.match.id, matchTypeById.get(result.match.id) === 'exact' ? 'exact' : result.matchType);
    const list = grouped.get(result.match.id) || [];
    const range = episodeRange(video.title);
    list.push({ number, ...(range || {}), title: video.title, videoId: video.videoId, videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`, publishedAt: video.publishedAt });
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
    item.confidence = 'confirmed_from_official_channel_uploads';
    item.youtubeMatchConfidence = matchTypeById.get(item.id) === 'fuzzy' ? 'fuzzy_title_match' : 'strong_unique_title_match';
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

module.exports = { aliasesForAnime, applyDiscoveries, diceSimilarity, fetchChannelUploads, matchVideoToAnime, mergeEpisodes, normalizeTitle, resolveChannel, resolveYears };
