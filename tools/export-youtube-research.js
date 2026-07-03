const fs = require('node:fs/promises');
const path = require('node:path');
const { bangkokYear } = require('./update-jikan');

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'data', 'anime.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'youtube-research-queue.json');

function playlistUrl(item) {
  if (item.playlistId) return `https://www.youtube.com/playlist?list=${item.playlistId}`;
  try {
    const url = new URL(item.link || '');
    const list = url.searchParams.get('list');
    return list ? `https://www.youtube.com/playlist?list=${list}` : '';
  } catch {
    return '';
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function main() {
  const year = bangkokYear();
  const anime = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));
  const items = anime
    .filter(item => item.jikanType === 'TV' && Number(item.catalogYear || item.year) === year)
    .sort((a, b) => String(a.season).localeCompare(String(b.season)) || String(a.titleOriginal).localeCompare(String(b.titleOriginal)))
    .map(item => ({
      id: item.id,
      malId: item.malId,
      malUrl: item.malUrl || '',
      titleThai: item.titleThai || '',
      titleOriginal: item.titleOriginal || '',
      altTitle: item.altTitle || '',
      youtubeAliases: item.youtubeAliases || [],
      year: Number(item.catalogYear || item.year),
      season: item.season || '',
      premiere: item.premiere || '',
      airTimeThai: item.airTimeThai || '',
      studio: item.studio || '',
      genres: item.genres || [],
      knownChannel: item.channel || '',
      knownChannelId: item.youtubeChannelId || '',
      playlistUrl: playlistUrl(item),
      episodeUrls: unique((item.availableEpisodes || []).map(episode => episode.videoUrl)),
      latestVideoUrl: item.latestVideoUrl || '',
      researchStatus: item.playlistId || item.latestVideoUrl ? 'has_known_youtube_source' : 'needs_research',
      officialChannelName: item.youtubeChannelTitle || '',
      officialChannelUrl: item.youtubeChannelId ? `https://www.youtube.com/channel/${item.youtubeChannelId}` : '',
      sourceUrls: [],
      notes: '',
      confidence: item.youtubeMatchConfidence || ''
    }));

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    year,
    itemCount: items.length,
    instructions: [
      'Research only official/licensed YouTube channels.',
      'Prefer playlistUrl. Add direct full-episode URLs to episodeUrls.',
      'Add localized YouTube title variants to youtubeAliases.',
      'Record evidence pages in sourceUrls and set confidence to confirmed or probable.',
      'Do not add trailers, PV, OP, ED, music, announcements, reuploads, or unofficial channels.',
      'Keep malId and id unchanged so the result can be imported safely.'
    ],
    items
  };
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Exported ${items.length} anime to ${path.relative(ROOT, OUTPUT_PATH)}.`);
}

if (require.main === module) main().catch(error => { console.error(`Research export failed: ${error.message}`); process.exitCode = 1; });

module.exports = { playlistUrl };
