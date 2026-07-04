// Card progress bar based on the number of YouTube episodes we actually detected,
// capped at the season total. This avoids using franchise-wide episode numbers
// such as Re:Zero episode 77 against a season total such as 19 episodes.
function episodeProgress(item) {
  const total = Number(item && item.episodes);
  const count = Array.isArray(item && item.availableEpisodes) ? item.availableEpisodes.length : 0;
  const show = Number.isFinite(total) && total > 0 && count > 0;
  const current = show ? Math.min(count, total) : count;
  const percent = show ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return { show, current, total, percent };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { episodeProgress };
