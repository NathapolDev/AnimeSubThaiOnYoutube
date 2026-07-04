const fs = require('node:fs/promises');
const path = require('node:path');

const { writeDataFiles } = require('./write-data');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const API_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function youtubeJson(url, attempt = 1) {
  const response = await fetch(url);
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    await wait(1000 * attempt);
    return youtubeJson(url, attempt + 1);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `YouTube API returned HTTP ${response.status}`);
  return body;
}
const EXCLUDED = /(?:\b(?:trailer|teaser|opening|ending|music|announcement|promo(?:tional)?|pv|op|ed|highlights?|recap|shorts?)\b|ตัวอย่าง|เพลงเปิด|เพลงปิด|ประกาศ|โปรโมต|ไฮไลท์|สรุปใน\s*[0-9]+\s*นาที)/iu;
const EPISODE_PATTERNS = [
  /ตอน(?:ที่)?\s*([0-9]+(?:\.[0-9]+)?)/iu,
  /\bep(?:isode)?\.?\s*[-:#]?\s*([0-9]+(?:\.[0-9]+)?)/iu,
  /#\s*([0-9]+(?:\.[0-9]+)?)(?!\d)/u
];

function playlistIdFromLink(link = '') {
  try {
    const url = new URL(link);
    return url.hostname.match(/(?:^|\.)youtube\.com$/i) ? url.searchParams.get('list') || '' : '';
  } catch {
    return '';
  }
}

function episodeNumber(title) {
  for (const pattern of EPISODE_PATTERNS) {
    const match = title.match(pattern);
    if (!match) continue;
    const number = Number(match[1]);
    // "#1900+" is almost always a year hashtag, not an episode number
    if (number >= 1900) continue;
    return number;
  }
  return null;
}

function isEpisode(title) {
  if (!title || EXCLUDED.test(title)) return false;
  return !/^(?:\[?(?:private|deleted) video\]?|วิดีโอส่วนตัว|วิดีโอถูกลบ)$/iu.test(title.trim());
}

async function fetchPlaylist(playlistId, apiKey) {
  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails', maxResults: '50', playlistId, key: apiKey
    });
    if (pageToken) params.set('pageToken', pageToken);
    const body = await youtubeJson(`${API_URL}?${params}`);
    items.push(...(body.items || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return items;
}

function buildEpisodeList(items, playlistId) {
  const unique = new Map();
  for (const item of items
    .map(item => {
      const title = item.snippet?.title || '';
      return {
        title,
        videoId: item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '',
        publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || '',
        number: episodeNumber(title)
      };
    })
    .filter(item => item.videoId && isEpisode(item.title))) {
    if (!unique.has(item.videoId)) unique.set(item.videoId, item);
  }

  const episodes = [...unique.values()];
  if (!episodes.some(item => item.number !== null)) {
    episodes
      .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))
      .forEach((item, index) => { item.number = index + 1; });
  }
  return episodes
    .map(item => ({
      number: item.number,
      title: item.title,
      videoId: item.videoId,
      videoUrl: `https://www.youtube.com/watch?v=${item.videoId}&list=${playlistId}`,
      publishedAt: item.publishedAt
    }))
    .sort((a, b) => {
      if (a.number !== null && b.number !== null) return b.number - a.number || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      if (a.number !== null) return -1;
      if (b.number !== null) return 1;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });
}

async function updateAnimeItem(item, apiKey, playlistFetcher = fetchPlaylist) {
    item.playlistId ||= playlistIdFromLink(item.link);
    item.currentEpisode ??= 0;
    item.latestEpisodeTitle ??= '';
    item.latestVideoUrl ??= '';
    item.latestPublishedAt ??= '';
    item.lastCheckedAt ??= '';
    item.updateStatus ??= 'pending';
    item.updateError ??= '';
    item.confidence ??= '';
    item.availableEpisodes ??= [];
    item.youtubeAliases ??= [];
    item.youtubeSourceType ??= '';
    item.youtubeChannelId ??= '';
    item.youtubeChannelTitle ??= '';
    item.youtubeMatchConfidence ??= '';

    if (!item.playlistId) {
      if (item.youtubeSourceType === 'channel_uploads' && item.availableEpisodes.length) return;
      item.availableEpisodes = [];
      item.currentEpisode = 0;
      item.latestEpisodeTitle = '';
      item.latestVideoUrl = '';
      item.latestPublishedAt = '';
      item.updateStatus = 'no_playlist';
      item.updateError = '';
      return;
    }

    item.lastCheckedAt = new Date().toISOString();
    try {
      const episodes = buildEpisodeList(await playlistFetcher(item.playlistId, apiKey), item.playlistId);
      item.availableEpisodes = episodes;
      const latest = episodes[0];
      if (!latest) {
        item.currentEpisode = 0;
        item.latestEpisodeTitle = '';
        item.latestVideoUrl = '';
        item.latestPublishedAt = '';
        item.updateStatus = 'no_episode_found';
        item.updateError = '';
        if (!item.status) item.status = 'upcoming';
        return;
      }
      item.currentEpisode = latest.number;
      item.latestEpisodeTitle = latest.title;
      item.latestVideoUrl = latest.videoUrl;
      item.latestPublishedAt = latest.publishedAt;
      item.status = 'available';
      item.updateStatus = 'ok';
      item.updateError = '';
      item.confidence = 'confirmed_from_youtube_playlist';
      item.youtubeSourceType = 'playlist';
      item.youtubeMatchConfidence = 'confirmed_playlist';
    } catch (error) {
      item.updateStatus = 'error';
      item.updateError = error instanceof Error ? error.message : String(error);
      console.error(`[${item.id}] ${item.updateError}`);
    }
}

async function updateAnimeItems(anime, apiKey, playlistFetcher = fetchPlaylist) {
  for (const item of anime) await updateAnimeItem(item, apiKey, playlistFetcher);
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY. Set it before running the updater.');

  const anime = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  await updateAnimeItems(anime, apiKey);

  await writeDataFiles(anime);
  console.log(`Updated ${anime.length} anime entries.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Update failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { buildEpisodeList, episodeNumber, fetchPlaylist, isEpisode, playlistIdFromLink, updateAnimeItem, updateAnimeItems, youtubeJson };
