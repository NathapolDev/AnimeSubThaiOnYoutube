const fs = require('node:fs/promises');
const path = require('node:path');
const { playlistIdFromLink } = require('./update-youtube');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const JS_PATH = path.join(ROOT, 'data', 'anime.js');
const QUEUE_PATH = path.join(ROOT, 'data', 'youtube-research-queue.json');

function uniqueStrings(values = []) {
  return [...new Set(values.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
}

function youtubeVideoId(value = '') {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0];
    if (/(?:^|\.)youtube\.com$/i.test(url.hostname)) return url.searchParams.get('v') || '';
  } catch {}
  return '';
}

function importResearch(anime, queue) {
  if (queue?.schemaVersion !== 1 || !Array.isArray(queue.items)) throw new Error('Unsupported or invalid research queue.');
  const byId = new Map(anime.map(item => [item.id, item]));
  const byMalId = new Map(anime.map(item => [Number(item.malId), item]));
  const result = { updated: 0, skipped: 0, conflicts: [], invalidEpisodeUrls: [] };

  for (const research of queue.items) {
    const idMatch = byId.get(research.id);
    const malMatch = byMalId.get(Number(research.malId));
    if (!idMatch || idMatch !== malMatch) {
      result.conflicts.push(`${research.id} (MAL ${research.malId})`);
      continue;
    }

    const hasResearch = Boolean(
      research.playlistUrl || research.episodeUrls?.length || research.sourceUrls?.length ||
      research.notes || research.lastResearchedAt || research.lastManualResearchAt
    );
    if (!hasResearch) {
      result.skipped += 1;
      continue;
    }

    const item = idMatch;
    const incomingPlaylistId = playlistIdFromLink(research.playlistUrl || '');
    if (incomingPlaylistId && item.playlistId && item.playlistId !== incomingPlaylistId) {
      result.conflicts.push(`${research.id}: playlist ${incomingPlaylistId} conflicts with ${item.playlistId}`);
      continue;
    }

    item.youtubeAliases = uniqueStrings([...(item.youtubeAliases || []), ...(research.youtubeAliases || [])]);
    item.youtubeResearchStatus = research.researchStatus || item.youtubeResearchStatus || '';
    item.youtubeResearchConfidence = research.confidence || item.youtubeResearchConfidence || '';
    item.youtubeResearchNotes = research.notes || item.youtubeResearchNotes || '';
    item.youtubeResearchSourceUrls = uniqueStrings([...(item.youtubeResearchSourceUrls || []), ...(research.sourceUrls || [])]);
    item.youtubeLastResearchedAt = research.lastResearchedAt || research.lastManualResearchAt || item.youtubeLastResearchedAt || '';
    item.youtubeOfficialChannelUrl = research.officialChannelUrl || item.youtubeOfficialChannelUrl || '';

    if (research.officialChannelName) {
      item.channel = research.officialChannelName;
      item.youtubeChannelTitle ||= research.officialChannelName;
    }
    if (research.knownChannelId) item.youtubeChannelId ||= research.knownChannelId;
    if (incomingPlaylistId && !item.playlistId) {
      item.playlistId = incomingPlaylistId;
      item.link = `https://www.youtube.com/playlist?list=${incomingPlaylistId}`;
      item.youtubeSourceType = 'playlist';
    }

    item.availableEpisodes ??= [];
    const knownVideoIds = new Set(item.availableEpisodes.map(episode => episode.videoId).filter(Boolean));
    for (const episodeUrl of uniqueStrings(research.episodeUrls || [])) {
      const videoId = youtubeVideoId(episodeUrl);
      if (!videoId) {
        result.invalidEpisodeUrls.push(`${research.id}: ${episodeUrl}`);
        continue;
      }
      if (knownVideoIds.has(videoId)) continue;
      item.availableEpisodes.push({ number: null, title: '', videoId, videoUrl: episodeUrl, publishedAt: '' });
      knownVideoIds.add(videoId);
    }
    result.updated += 1;
  }
  return result;
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || QUEUE_PATH);
  const [anime, queue] = await Promise.all([
    fs.readFile(JSON_PATH, 'utf8').then(JSON.parse),
    fs.readFile(inputPath, 'utf8').then(JSON.parse)
  ]);
  const result = importResearch(anime, queue);
  if (result.conflicts.length) throw new Error(`Import conflicts:\n- ${result.conflicts.join('\n- ')}`);
  const json = `${JSON.stringify(anime, null, 2)}\n`;
  await fs.writeFile(JSON_PATH, json, 'utf8');
  await fs.writeFile(JS_PATH, `window.ANIME_DATA = ${json}`, 'utf8');
  await fs.copyFile(inputPath, QUEUE_PATH);
  console.log(`Imported ${result.updated} researched entries; skipped ${result.skipped}.`);
  if (result.invalidEpisodeUrls.length) console.warn(`Ignored invalid episode URLs:\n- ${result.invalidEpisodeUrls.join('\n- ')}`);
}

if (require.main === module) main().catch(error => { console.error(`Research import failed: ${error.message}`); process.exitCode = 1; });

module.exports = { importResearch, youtubeVideoId };
