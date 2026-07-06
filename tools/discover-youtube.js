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

// \p{M} keeps combining marks: Thai tone marks and sara vowels are Mn/Mc, and dropping
// them collapses distinct Thai titles onto the same consonant skeleton, which would let
// the fuzzy tier below auto-link the wrong show.
const normalizeTitle = value => String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

// Character-bigram multiset of a string plus its total count, used for the Dice
// coefficient below.
function bigrams(value) {
  const text = String(value || '');
  const grams = new Map();
  let size = 0;
  for (let index = 0; index < text.length - 1; index += 1) {
    const gram = text.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
    size += 1;
  }
  return { grams, size };
}

function diceFromBigrams(a, b) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const [gram, count] of a.grams) if (b.grams.has(gram)) overlap += Math.min(count, b.grams.get(gram));
  return (2 * overlap) / (a.size + b.size);
}

// Sørensen–Dice coefficient over character bigrams: 1 = identical, 0 = no shared
// bigram. Character-level (not word-level) so it works for Thai, which normalizeTitle
// cannot split into words. Callers pass already-normalized strings.
function diceSimilarity(a, b) {
  return diceFromBigrams(bigrams(a), bigrams(b));
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

const MIN_ALIAS_LENGTH = 6;

// Normalized alias pool with per-alias bigram data, memoized per item object — the
// source fields never change within a run, so each item is computed once no matter
// how many videos are scored against it.
const aliasCache = new WeakMap();
function aliasDataForAnime(item) {
  let data = aliasCache.get(item);
  if (!data) {
    const anilist = item.anilistTitles || {};
    data = [
      item.titleThai, item.titleOriginal, ...(String(item.altTitle || '').split('/')), ...(item.youtubeAliases || []),
      anilist.romaji, anilist.english, anilist.native, ...(Array.isArray(anilist.synonyms) ? anilist.synonyms : [])
    ].map(normalizeTitle).filter(Boolean).map(alias => ({ alias, grams: bigrams(alias) }));
    aliasCache.set(item, data);
  }
  return data;
}

// scan-unmatched-channel-shows.js passes a lower floor (4) so its "already known"
// filter stays deliberately more inclusive than the matcher's.
function aliasesForAnime(item, minLength = MIN_ALIAS_LENGTH) {
  return aliasDataForAnime(item).filter(entry => entry.alias.length >= minLength).map(entry => entry.alias);
}

// Two-tier matcher:
//   Tier 1 (exact): unique longest normalized alias that is a substring of the video
//     title — the original, high-precision path. Applied automatically.
//   Tier 2 (fuzzy): only when Tier 1 finds nothing. Dice-similarity of the extracted
//     show name against each anime's aliases. A clear winner >= AUTO_THRESHOLD is applied;
//     medium-confidence / ambiguous winners become review suggestions, never auto-linked.
// Returns { match, matchType: 'exact'|'fuzzy'|null, score, alias, extractedShowName,
// candidates, suggestions } — alias is the winning normalized alias (empty when no
// winner) and extractedShowName is the normalized Tier 2 input (empty on Tier 1 paths,
// where it is never computed); both feed match diagnostics and the candidates log.
function matchVideoToAnime(video, anime) {
  const normalizedVideo = normalizeTitle(video.title);
  const scored = [];
  for (const item of anime) {
    let best = '';
    for (const { alias } of aliasDataForAnime(item)) {
      if (alias.length >= MIN_ALIAS_LENGTH && alias.length > best.length && normalizedVideo.includes(alias)) best = alias;
    }
    if (best) scored.push({ item, score: best.length, alias: best });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length) {
    const leaders = scored.filter(value => value.score === scored[0].score);
    return leaders.length === 1
      ? { match: leaders[0].item, matchType: 'exact', score: leaders[0].score, alias: leaders[0].alias, extractedShowName: '', candidates: leaders, suggestions: [] }
      : { match: null, matchType: null, score: leaders[0].score, alias: '', extractedShowName: '', candidates: leaders, suggestions: [] };
  }

  const showName = normalizeTitle(extractShowName(video.title));
  if (showName.length < MIN_ALIAS_LENGTH) return { match: null, matchType: null, score: 0, alias: '', extractedShowName: showName, candidates: [], suggestions: [] };
  const showGrams = bigrams(showName);
  const fuzzy = [];
  for (const item of anime) {
    let best = 0, bestAlias = '';
    for (const { alias, grams } of aliasDataForAnime(item)) {
      if (alias.length < MIN_ALIAS_LENGTH) continue;
      const score = diceFromBigrams(showGrams, grams);
      if (score > best) { best = score; bestAlias = alias; }
    }
    if (best >= SUGGEST_THRESHOLD) fuzzy.push({ item, score: best, alias: bestAlias });
  }
  fuzzy.sort((a, b) => b.score - a.score);
  if (!fuzzy.length) return { match: null, matchType: null, score: 0, alias: '', extractedShowName: showName, candidates: [], suggestions: [] };
  const top = fuzzy[0];
  if (top.score >= AUTO_THRESHOLD && top.score - (fuzzy[1]?.score ?? 0) >= FUZZY_MARGIN) {
    return { match: top.item, matchType: 'fuzzy', score: top.score, alias: top.alias, extractedShowName: showName, candidates: [], suggestions: [] };
  }
  const suggestions = fuzzy.filter(value => value.score >= top.score - FUZZY_MARGIN);
  return { match: null, matchType: null, score: top.score, alias: '', extractedShowName: showName, candidates: [], suggestions };
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
  // Best-explaining match per anime this run: exact beats fuzzy, then higher score.
  // Feeds the youtubeMatched* diagnostic fields written below.
  const bestMatchById = new Map();
  for (const video of videos) {
    const number = episodeNumber(video.title);
    if (!video.videoId || number === null || !isEpisode(video.title)) continue;
    const result = matchVideoToAnime(video, eligible);
    if (!result.match) {
      if (result.candidates.length) candidatesLog.push({
        type: 'ambiguous_title', videoId: video.videoId, title: video.title, channel: channel.channelTitle,
        publishedAt: video.publishedAt, episodeNumber: number,
        matches: result.candidates.map(value => ({
          id: value.item.id, titleThai: value.item.titleThai || '', titleOriginal: value.item.titleOriginal || '',
          alias: value.alias, matchLength: value.score
        }))
      });
      if (result.suggestions.length) candidatesLog.push({
        type: 'fuzzy_suggestion', videoId: video.videoId, title: video.title, channel: channel.channelTitle,
        publishedAt: video.publishedAt, episodeNumber: number, extractedShowName: result.extractedShowName,
        matches: result.suggestions.map(suggestion => ({
          id: suggestion.item.id, titleThai: suggestion.item.titleThai || '', titleOriginal: suggestion.item.titleOriginal || '',
          alias: suggestion.alias, similarity: Number(suggestion.score.toFixed(3))
        }))
      });
      continue;
    }
    // A show reached from a strong exact match keeps that provenance even if some of
    // its other episodes only matched fuzzily.
    const previousBest = bestMatchById.get(result.match.id);
    const outranksPrevious = !previousBest
      || (previousBest.matchType === 'fuzzy' && result.matchType === 'exact')
      || (previousBest.matchType === result.matchType && result.score > previousBest.score);
    if (outranksPrevious) {
      bestMatchById.set(result.match.id, { matchType: result.matchType, alias: result.alias, videoTitle: video.title, score: result.score });
    }
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
    // Incremental runs only see new uploads, so a fuzzy-only run must not downgrade a
    // show whose identity an earlier run already confirmed with an exact title match —
    // that guard covers the youtubeMatched* diagnostics too, so the stored explanation
    // always describes the strongest evidence seen, not merely the latest.
    const best = bestMatchById.get(item.id);
    if (best.matchType === 'exact' || item.youtubeMatchConfidence !== 'strong_unique_title_match') {
      item.youtubeMatchConfidence = best.matchType === 'exact' ? 'strong_unique_title_match' : 'fuzzy_title_match';
      item.youtubeMatchType = best.matchType;
      item.youtubeMatchedAlias = best.alias;
      item.youtubeMatchedVideoTitle = best.videoTitle;
      // Exact scores are the matched alias length (longer alias = more specific match);
      // fuzzy scores are the 0-1 Dice similarity.
      item.youtubeMatchedScore = best.matchType === 'exact' ? best.score : Number(best.score.toFixed(3));
    }
    item.youtubeLastMatchedAt = new Date().toISOString();
    item.youtubeDiscoveryStatus = 'matched';
    item.youtubeSourceType = 'channel_uploads'; item.youtubeChannelId = channel.channelId; item.youtubeChannelTitle = channel.channelTitle;
    item.channel = channel.label; item.platform = 'YouTube';
  }
  return grouped.size;
}

// Cross-channel review status, finalized once per run after every channel has been
// scanned (a single channel's pass can't tell "not found anywhere" from "found on a
// later channel"). Values: matched | needs_review | not_found | skipped_has_playlist
// | error. Precedence is strongest-first, and needs_review is sticky: incremental
// runs only see new uploads, so a run with no fresh evidence must not flip an item
// awaiting review to not_found. not_found is likewise only assigned when every
// channel scanned cleanly (hadChannelErrors false) — a partial scan can prove
// presence but never absence, so unmatched items keep their stored status.
function updateDiscoveryStatuses(anime, { reviewIds = new Set(), erroredChannelIds = new Set(), hadChannelErrors = false, years = catalogYears() } = {}) {
  const yearList = toYearList(years);
  const yearSet = new Set(yearList);
  const minYear = Math.min(...yearList);
  for (const item of anime) {
    if (item.jikanType !== 'TV' || !yearSet.has(Number(item.catalogYear || item.year) || minYear)) continue;
    if (item.playlistId) { item.youtubeDiscoveryStatus = 'skipped_has_playlist'; continue; }
    if (item.youtubeSourceType === 'channel_uploads' && (item.availableEpisodes || []).length) { item.youtubeDiscoveryStatus = 'matched'; continue; }
    if (reviewIds.has(item.id) || item.youtubeDiscoveryStatus === 'needs_review') { item.youtubeDiscoveryStatus = 'needs_review'; continue; }
    if (item.youtubeChannelId && erroredChannelIds.has(item.youtubeChannelId)) { item.youtubeDiscoveryStatus = 'error'; continue; }
    if (hadChannelErrors) continue;
    item.youtubeDiscoveryStatus = 'not_found';
  }
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
  const erroredChannelIds = new Set();
  let matchedAnime = 0, scannedChannels = 0, failedChannels = 0;
  for (const config of configs) {
    try {
      const resolved = await resolveChannel(config, apiKey);
      const channel = { ...resolved, ...config };
      const result = await fetchChannelUploads(channel, state.channels[config.handle], years, backfill, apiKey);
      matchedAnime += applyDiscoveries(anime, channel, result.videos, candidates, years);
      scannedChannels += 1;
      state.channels[config.handle] = {
        channelId: channel.channelId, uploadsPlaylistId: channel.uploadsPlaylistId,
        lastSeenVideoId: result.newestVideoId, lastCheckedAt: new Date().toISOString(), year: windowYear
      };
    } catch (error) {
      console.error(`[${config.handle}] ${error.message}`);
      // A first-ever failure has no stored channelId yet, so failedChannels (not
      // erroredChannelIds.size) is what decides whether the scan was partial.
      failedChannels += 1;
      const channelId = state.channels[config.handle]?.channelId;
      if (channelId) erroredChannelIds.add(channelId);
      state.channels[config.handle] = { ...(state.channels[config.handle] || {}), lastError: error.message };
    }
  }
  // A run where every channel errored produced no evidence at all — leave the stored
  // statuses alone rather than mass-flipping the catalog to not_found.
  if (scannedChannels > 0) {
    const reviewIds = new Set(candidates.flatMap(entry => (entry.matches || []).map(match => match.id)));
    updateDiscoveryStatuses(anime, { reviewIds, erroredChannelIds, hadChannelErrors: failedChannels > 0, years });
  }
  await writeDataFiles(anime);
  await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.writeFile(CANDIDATES_PATH, `${JSON.stringify(candidates, null, 2)}\n`, 'utf8');
  console.log(`YouTube discovery complete: ${matchedAnime} anime updated, ${candidates.length} ambiguous candidates.`);
}

if (require.main === module) main().catch(error => { console.error(`YouTube discovery failed: ${error.message}`); process.exitCode = 1; });

module.exports = { CHANNELS_PATH, aliasesForAnime, applyDiscoveries, diceSimilarity, fetchChannelUploads, matchVideoToAnime, mergeEpisodes, normalizeTitle, resolveChannel, resolveYears, updateDiscoveryStatuses };
