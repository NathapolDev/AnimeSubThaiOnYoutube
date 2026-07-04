// Card progress bar based on the number of YouTube episodes we actually detected,
// capped at the season total. This avoids using franchise-wide episode numbers
// such as Re:Zero episode 77 against a season total such as 19 episodes.
function availableEpisodeCount(episodes) {
  if (!Array.isArray(episodes)) return 0;
  const represented = new Set();
  episodes.forEach((episode, index) => {
    const start = Number(episode && episode.startNumber);
    const end = Number(episode && episode.endNumber);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 1000) {
      for (let number = start; number <= end; number += 1) represented.add(`episode:${number}`);
      return;
    }
    const rawNumber = episode && episode.number;
    const number = rawNumber === null || rawNumber === undefined ? NaN : Number(rawNumber);
    represented.add(Number.isFinite(number) ? `episode:${number}` : `video:${episode?.videoId || index}`);
  });
  return represented.size;
}

function episodeProgress(item) {
  const total = Number(item && item.episodes);
  const count = availableEpisodeCount(item && item.availableEpisodes);
  const show = Number.isFinite(total) && total > 0 && count > 0;
  const current = show ? Math.min(count, total) : count;
  const percent = show ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return { show, current, total, percent };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { availableEpisodeCount, episodeProgress };
