const fs = require('node:fs/promises');
const path = require('node:path');

const { resolveYears } = require('./discover-youtube');
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
      externalLinks { site url type }
      streamingEpisodes { title url site }
    }
  }
}`;

const CR_EPISODE_TITLE = /^Episode\s+([0-9]+(?:\.[0-9]+)?)\s*(?:-\s*(.*))?$/i;

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

function crunchyrollLink(media) {
  const links = (media?.externalLinks || []).filter(link => link?.site === 'Crunchyroll' && link.url);
  const preferred = links.find(link => link.type === 'STREAMING') || links[0];
  return preferred ? toHttps(preferred.url) : '';
}

function parseCrEpisodeTitle(title) {
  const match = String(title || '').match(CR_EPISODE_TITLE);
  if (!match) return { rawNumber: null, episodeTitle: String(title || '') };
  return { rawNumber: Number(match[1]), episodeTitle: (match[2] || '').trim() };
}

// Sequel seasons often carry Crunchyroll's absolute numbering (e.g. 25-48 for a
// 24-episode second season). Shift back to season numbering only when the season
// total confirms the offset; never guess when the total is unknown ("?").
function normalizeEpisodeNumbers(episodes, seasonTotal) {
  const raws = episodes.map(episode => episode.rawNumber).filter(Number.isFinite).sort((a, b) => a - b);
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

function buildCrEpisodeList(streamingEpisodes, seasonTotal) {
  const unique = new Map();
  for (const episode of (streamingEpisodes || []).filter(episode => episode?.site === 'Crunchyroll' && episode.url)) {
    const url = toHttps(episode.url);
    if (unique.has(url)) continue;
    const { rawNumber, episodeTitle } = parseCrEpisodeTitle(episode.title);
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

function hasYoutubeSignal(item) {
  return Boolean(item.playlistId || item.latestVideoUrl || (item.availableEpisodes || []).length);
}

function applyCrunchyroll(item, media, now = () => new Date().toISOString()) {
  const seriesUrl = crunchyrollLink(media);
  if (!seriesUrl) {
    if (item.crunchyroll && item.confidence === 'confirmed_from_crunchyroll' && !hasYoutubeSignal(item)) {
      item.status = 'upcoming';
      item.confidence = 'imported_from_jikan';
    }
    delete item.crunchyroll;
    return;
  }
  const { episodes, offset } = buildCrEpisodeList(media.streamingEpisodes, item.episodes);
  item.crunchyroll = {
    seriesUrl,
    anilistId: media.id,
    numberingOffset: offset,
    availableEpisodes: episodes,
    episodeCount: episodes.length,
    latestEpisodeNumber: episodes[0]?.number ?? 0,
    lastCheckedAt: now(),
    updateStatus: episodes.length ? 'ok' : 'no_episode_found',
    updateError: ''
  };
  if (episodes.length) {
    item.status = 'available';
    if (!hasYoutubeSignal(item)) item.confidence = 'confirmed_from_crunchyroll';
  }
}

async function fetchCrunchyrollMedia(malIds, requester = anilistRequest) {
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

async function updateCrunchyrollItems(anime, years, requester = anilistRequest) {
  const yearSet = new Set(Array.isArray(years) ? years : [years]);
  const targets = anime.filter(item => Number.isInteger(item.malId)
    && item.jikanType === 'TV'
    && yearSet.has(Number(item.catalogYear || item.year)));
  const { found, failedIds } = await fetchCrunchyrollMedia(targets.map(item => item.malId), requester);
  let onCrunchyroll = 0;
  let withEpisodes = 0;
  let errors = 0;
  for (const item of targets) {
    if (failedIds.has(item.malId)) {
      // Keep stale data but flag it, instead of silently pretending it is fresh.
      if (item.crunchyroll) {
        item.crunchyroll.updateStatus = 'error';
        item.crunchyroll.updateError = 'AniList request failed';
        errors += 1;
      }
      continue;
    }
    applyCrunchyroll(item, found.get(item.malId));
    if (item.crunchyroll) {
      onCrunchyroll += 1;
      if (item.crunchyroll.episodeCount) withEpisodes += 1;
    }
  }
  return { targets: targets.length, onCrunchyroll, withEpisodes, errors };
}

async function main() {
  const years = resolveYears();
  const anime = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const summary = await updateCrunchyrollItems(anime, years);
  await writeDataFiles(anime);
  console.log(`Crunchyroll sync (years ${years.join(', ')}): ${summary.onCrunchyroll}/${summary.targets} on Crunchyroll, ${summary.withEpisodes} with episodes, ${summary.errors} stale after errors.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Crunchyroll update failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  anilistRequest,
  applyCrunchyroll,
  buildCrEpisodeList,
  chunk,
  crunchyrollLink,
  fetchCrunchyrollMedia,
  normalizeEpisodeNumbers,
  parseCrEpisodeTitle,
  toHttps,
  updateCrunchyrollItems
};
