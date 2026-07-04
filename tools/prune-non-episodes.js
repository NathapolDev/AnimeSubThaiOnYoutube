const fs = require('node:fs/promises');
const path = require('node:path');
const { isEpisode } = require('./update-youtube');
const { writeDataFiles } = require('./write-data');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');

// Same ordering used by update-youtube/discover-youtube: numbered episodes
// newest-first, unnumbered ones fall back to publish date.
function sortEpisodes(episodes) {
  return [...episodes].sort((a, b) => {
    if (a.number !== null && b.number !== null) return b.number - a.number || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}

// Re-apply the current episode filter to an item's cached availableEpisodes and
// recompute its summary fields. discover-youtube.js merges episodes but never
// removes them, so a clip that only became excluded after EXCLUDED was tightened
// (highlights, #Shorts, recaps) stays until it is pruned here. Returns true when
// the item changed.
function pruneItem(item) {
  const original = item.availableEpisodes || [];
  const kept = original.filter(episode => isEpisode(episode.title));
  if (kept.length === original.length) return false;

  const episodes = sortEpisodes(kept);
  item.availableEpisodes = episodes;
  const latest = episodes[0];
  if (!latest) {
    item.currentEpisode = 0;
    item.latestEpisodeTitle = '';
    item.latestVideoUrl = '';
    item.latestPublishedAt = '';
    item.updateStatus = 'no_episode_found';
    item.updateError = '';
    if (!item.status || item.status === 'available') item.status = 'upcoming';
  } else {
    item.currentEpisode = latest.number;
    item.latestEpisodeTitle = latest.title;
    item.latestVideoUrl = latest.videoUrl;
    item.latestPublishedAt = latest.publishedAt;
  }
  return true;
}

function pruneAnime(anime) {
  return anime.filter(pruneItem).map(item => item.id);
}

async function main() {
  const anime = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const changed = pruneAnime(anime);
  await writeDataFiles(anime);
  console.log(changed.length ? `Pruned non-episode videos from ${changed.length} anime: ${changed.join(', ')}` : 'No non-episode videos found.');
}

if (require.main === module) {
  main().catch(error => { console.error(`Prune failed: ${error.message}`); process.exitCode = 1; });
}

module.exports = { pruneAnime, pruneItem, sortEpisodes };
