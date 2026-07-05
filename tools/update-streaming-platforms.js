const fs = require('node:fs/promises');
const path = require('node:path');

const { resolveYears } = require('./discover-youtube');
const { isEpisode } = require('./update-youtube');
const { writeDataFiles } = require('./write-data');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const ANILIST_URL = 'https://graphql.anilist.co';
const PAGE_SIZE = 50;
// AniList's degraded rate limit is 30 req/min; ~28 req/min keeps a safety margin.
const REQUEST_GAP_MS = 2100;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const MEDIA_QUERY = `query ($ids: [Int], $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(idMal_in: $ids, type: ANIME) {
      id
      idMal
      status
      episodes
      nextAiringEpisode { episode }
      externalLinks { site url type }
      streamingEpisodes { title url site }
    }
  }
}`;

const EPISODE_TITLE_PATTERN = /^Episode\s+([0-9]+(?:\.[0-9]+)?)\s*(?:-\s*(.*))?$/i;

// AniList's externalLinks/streamingEpisodes already carry every site for a
// title in one response, so both platforms below come from a single fetch —
// no extra AniList requests are needed to add a platform here.
// Bilibili TV (bilibili.tv) is the licensed, Thai/SEA-facing global service;
// plain "Bilibili" on AniList maps to bilibili.com, the mainland China site
// with no Thai subtitles, and is intentionally never matched here.
// Live sampling (Spring 2026 + top Chinese-origin titles) found Bilibili TV
// series links are common in externalLinks, but streamingEpisodes tagged
// "Bilibili TV" was empty in every sample — so Bilibili entries almost always
// land on episodeSource: 'estimated_from_airing' rather than 'anilist_links'.
// The per-episode path is still implemented generically for when AniList
// populates it.
const PLATFORMS = [
  { key: 'crunchyroll', site: 'Crunchyroll', field: 'crunchyroll', confidence: 'confirmed_from_crunchyroll', outranks: [] },
  { key: 'bilibili', site: 'Bilibili TV', field: 'bilibili', confidence: 'confirmed_from_bilibili', outranks: ['crunchyroll'] }
];

async function anilistRequest(query, variables, attempt = 1, fetcher = fetch) {
  const response = await fetcher(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers?.get?.('retry-after')) * 1000;
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1000 * attempt);
    return anilistRequest(query, variables, attempt + 1, fetcher);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.errors?.length) {
    throw new Error(body?.errors?.[0]?.message || `AniList API returned HTTP ${response.status}`);
  }
  return body;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function toHttps(url) {
  return String(url || '').replace(/^http:\/\//i, 'https://');
}

function platformLink(media, site) {
  const links = (media?.externalLinks || []).filter(link => link?.site === site && link.url);
  const preferred = links.find(link => link.type === 'STREAMING') || links[0];
  return preferred ? toHttps(preferred.url) : '';
}

function parseEpisodeTitle(title) {
  const match = String(title || '').match(EPISODE_TITLE_PATTERN);
  if (!match) return { rawNumber: null, episodeTitle: String(title || '') };
  return { rawNumber: Number(match[1]), episodeTitle: (match[2] || '').trim() };
}

// Sequel seasons often carry a platform's absolute numbering (e.g. 25-48 for a
// 24-episode second season). Shift back to season numbering only when the season
// total confirms the offset; never guess when the total is unknown ("?").
function normalizeEpisodeNumbers(episodes, seasonTotal) {
  // Decimal episode numbers (e.g. 12.5) mark specials tacked onto a season, not
  // absolute cross-season numbering, so they never drive offset detection —
  // only the whole-number episodes do. A detected offset still applies to them.
  const raws = episodes.map(episode => episode.rawNumber).filter(Number.isInteger).sort((a, b) => a - b);
  if (!raws.length) return { episodes: episodes.map(episode => ({ ...episode, number: episode.rawNumber })), offset: 0 };
  const min = raws[0];
  const max = raws[raws.length - 1];
  const total = Number(seasonTotal);
  const contiguous = max - min + 1 >= raws.length;
  const offset = min > 1 && Number.isFinite(total) && total > 0 && max > total && raws.length <= total && contiguous
    ? min - 1
    : 0;
  return {
    episodes: episodes.map(episode => ({
      ...episode,
      number: Number.isFinite(episode.rawNumber) ? episode.rawNumber - offset : null
    })),
    offset
  };
}

function buildEpisodeList(streamingEpisodes, seasonTotal, site) {
  const unique = new Map();
  // Reuse the YouTube trailer/PV/recap filter: AniList's streamingEpisodes
  // sometimes tags a movie trailer onto a TV entry, which would otherwise
  // count as a "real" episode and skip the airing-schedule estimate.
  for (const episode of (streamingEpisodes || []).filter(episode => episode?.site === site && episode.url && isEpisode(episode.title))) {
    const url = toHttps(episode.url);
    if (unique.has(url)) continue;
    const { rawNumber, episodeTitle } = parseEpisodeTitle(episode.title);
    unique.set(url, { rawNumber, title: episodeTitle, url });
  }
  const { episodes, offset } = normalizeEpisodeNumbers([...unique.values()], seasonTotal);
  episodes.sort((a, b) => {
    if (a.number !== null && b.number !== null) return b.number - a.number;
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return 0;
  });
  return {
    offset,
    episodes: episodes.map(episode => ({
      number: episode.number,
      rawNumber: episode.rawNumber,
      title: episode.title,
      url: episode.url
    }))
  };
}

// AniList's streamingEpisodes only covers a fraction of titles, so when it is
// empty the airing schedule tells us how many episodes are already out.
// AniList numbering is per-season, so no cross-season offset applies here.
function airedEpisodeCount(media) {
  if (media?.status === 'RELEASING' && Number.isFinite(media.nextAiringEpisode?.episode)) {
    return Math.max(0, media.nextAiringEpisode.episode - 1);
  }
  if (media?.status === 'FINISHED' && Number.isFinite(media.episodes)) return media.episodes;
  return 0;
}

function hasYoutubeSignal(item) {
  return Boolean(item.playlistId || item.latestVideoUrl || (item.availableEpisodes || []).length);
}

// Bilibili yields to a Crunchyroll confirmation (and both yield to YouTube via
// hasYoutubeSignal), so a lower-priority platform never overwrites a
// higher-priority one's claim on status/confidence within the same run.
function isOutrankedByHigherPlatform(item, platform) {
  return platform.outranks.some(key => {
    const higher = PLATFORMS.find(candidate => candidate.key === key);
    return Boolean(higher && item[higher.field]?.episodeCount > 0);
  });
}

// A platform-only item (no YouTube source) loses its 'available' status the
// moment that platform no longer backs it up, whether the series link
// disappeared entirely or the link remains but the episode count dropped to
// zero.
function revertPlatformOnlyStatus(item, platform) {
  if (item.confidence === platform.confidence && !hasYoutubeSignal(item)) {
    item.status = 'upcoming';
    item.confidence = 'imported_from_jikan';
  }
}

function applyPlatform(item, media, platform, now = () => new Date().toISOString()) {
  const seriesUrl = platformLink(media, platform.site);
  if (!seriesUrl) {
    revertPlatformOnlyStatus(item, platform);
    delete item[platform.field];
    return;
  }
  const { episodes, offset } = buildEpisodeList(media.streamingEpisodes, item.episodes, platform.site);
  const aired = episodes.length ? 0 : airedEpisodeCount(media);
  const episodeCount = episodes.length || aired;
  item[platform.field] = {
    seriesUrl,
    anilistId: media.id,
    numberingOffset: offset,
    availableEpisodes: episodes,
    episodeCount,
    latestEpisodeNumber: episodes.length ? episodes[0]?.number ?? 0 : aired,
    episodeSource: episodes.length ? 'anilist_links' : (aired ? 'estimated_from_airing' : ''),
    lastCheckedAt: now(),
    updateStatus: episodeCount ? 'ok' : 'no_episode_found',
    updateError: ''
  };
  if (episodeCount) {
    item.status = 'available';
    if (!hasYoutubeSignal(item) && !isOutrankedByHigherPlatform(item, platform)) {
      item.confidence = platform.confidence;
    }
  } else {
    revertPlatformOnlyStatus(item, platform);
  }
}

async function fetchAnilistMedia(malIds, requester = anilistRequest) {
  const found = new Map();
  const failedIds = new Set();
  const chunks = chunk(malIds, PAGE_SIZE);
  for (const [index, ids] of chunks.entries()) {
    try {
      let page = 1;
      let hasNextPage = true;
      while (hasNextPage) {
        if (page > 1 || index > 0) await wait(REQUEST_GAP_MS);
        const body = await requester(MEDIA_QUERY, { ids, page, perPage: PAGE_SIZE });
        for (const media of body?.data?.Page?.media || []) {
          if (Number.isInteger(media?.idMal)) found.set(media.idMal, media);
        }
        hasNextPage = Boolean(body?.data?.Page?.pageInfo?.hasNextPage);
        page += 1;
      }
    } catch (error) {
      for (const id of ids) failedIds.add(id);
      console.error(`[anilist chunk ${index + 1}/${chunks.length}] ${error instanceof Error ? error.message : error}`);
    }
  }
  return { found, failedIds };
}

async function updateStreamingPlatformItems(anime, years, requester = anilistRequest) {
  const yearSet = new Set(Array.isArray(years) ? years : [years]);
  const targets = anime.filter(item => Number.isInteger(item.malId)
    && item.jikanType === 'TV'
    && yearSet.has(Number(item.catalogYear || item.year)));
  const { found, failedIds } = await fetchAnilistMedia(targets.map(item => item.malId), requester);
  const byPlatform = Object.fromEntries(PLATFORMS.map(platform => [platform.key, { onPlatform: 0, withEpisodes: 0 }]));
  let errors = 0;
  for (const item of targets) {
    if (failedIds.has(item.malId)) {
      // Keep stale data but flag it, instead of silently pretending it is fresh.
      let flagged = false;
      for (const platform of PLATFORMS) {
        if (item[platform.field]) {
          item[platform.field].updateStatus = 'error';
          item[platform.field].updateError = 'AniList request failed';
          flagged = true;
        }
      }
      if (flagged) errors += 1;
      continue;
    }
    const media = found.get(item.malId);
    for (const platform of PLATFORMS) {
      applyPlatform(item, media, platform);
      if (item[platform.field]) {
        byPlatform[platform.key].onPlatform += 1;
        if (item[platform.field].episodeCount) byPlatform[platform.key].withEpisodes += 1;
      }
    }
  }
  return { targets: targets.length, byPlatform, errors };
}

async function main() {
  const years = resolveYears();
  const anime = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const summary = await updateStreamingPlatformItems(anime, years);
  await writeDataFiles(anime);
  const platformSummaries = PLATFORMS.map(platform => {
    const stats = summary.byPlatform[platform.key];
    return `${platform.key} ${stats.onPlatform}/${summary.targets} (${stats.withEpisodes} w/ episodes)`;
  }).join(', ');
  console.log(`Streaming sync (years ${years.join(', ')}): ${platformSummaries}, ${summary.errors} stale after errors.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Streaming platform update failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  PLATFORMS,
  airedEpisodeCount,
  anilistRequest,
  applyPlatform,
  buildEpisodeList,
  chunk,
  fetchAnilistMedia,
  isOutrankedByHigherPlatform,
  normalizeEpisodeNumbers,
  parseEpisodeTitle,
  platformLink,
  revertPlatformOnlyStatus,
  toHttps,
  updateStreamingPlatformItems
};
