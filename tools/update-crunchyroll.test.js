const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyCrunchyroll,
  buildCrEpisodeList,
  chunk,
  crunchyrollLink,
  fetchCrunchyrollMedia,
  normalizeEpisodeNumbers,
  parseCrEpisodeTitle,
  toHttps,
  updateCrunchyrollItems
} = require('./update-crunchyroll');

test('parseCrEpisodeTitle handles dash, no-dash, decimal, and unparseable titles', () => {
  assert.deepEqual(parseCrEpisodeTitle('Episode 48 - The Beginning'), { rawNumber: 48, episodeTitle: 'The Beginning' });
  assert.deepEqual(parseCrEpisodeTitle('Episode 3'), { rawNumber: 3, episodeTitle: '' });
  assert.deepEqual(parseCrEpisodeTitle('Episode 12.5 - Recap'), { rawNumber: 12.5, episodeTitle: 'Recap' });
  assert.deepEqual(parseCrEpisodeTitle('Special - Bonus'), { rawNumber: null, episodeTitle: 'Special - Bonus' });
});

test('normalizeEpisodeNumbers shifts continuous sequel numbering back to season numbering', () => {
  const episodes = Array.from({ length: 24 }, (_, i) => ({ rawNumber: 25 + i, title: `t${i}`, url: `u${i}` }));
  const { episodes: normalized, offset } = normalizeEpisodeNumbers(episodes, '24');
  assert.equal(offset, 24);
  assert.equal(normalized[0].number, 1);
  assert.equal(normalized[23].number, 24);
});

test('normalizeEpisodeNumbers keeps raw numbers when it cannot be sure', () => {
  const high = [{ rawNumber: 25 }, { rawNumber: 26 }];
  assert.equal(normalizeEpisodeNumbers(high, '?').offset, 0);
  assert.equal(normalizeEpisodeNumbers(high, '?').episodes[0].number, 25);
  // normal numbering starting at 1 is never shifted
  const normal = [{ rawNumber: 1 }, { rawNumber: 2 }];
  assert.equal(normalizeEpisodeNumbers(normal, '12').offset, 0);
  // more episodes than the season total means it is not a plain offset
  const overfull = Array.from({ length: 30 }, (_, i) => ({ rawNumber: 25 + i }));
  assert.equal(normalizeEpisodeNumbers(overfull, '24').offset, 0);
  // within the season total, no shift even if it starts above 1 (mid-cour catch-up)
  const withinTotal = [{ rawNumber: 5 }, { rawNumber: 6 }];
  assert.equal(normalizeEpisodeNumbers(withinTotal, '12').offset, 0);
});

test('buildCrEpisodeList filters to Crunchyroll, dedupes by url, upgrades http, sorts newest-first', () => {
  const { episodes, offset } = buildCrEpisodeList([
    { title: 'Episode 1 - A', url: 'http://www.crunchyroll.com/watch/a', site: 'Crunchyroll' },
    { title: 'Episode 2 - B', url: 'https://www.crunchyroll.com/watch/b', site: 'Crunchyroll' },
    { title: 'Episode 2 - B dup', url: 'http://www.crunchyroll.com/watch/b', site: 'Crunchyroll' },
    { title: 'Episode 3 - C', url: 'https://www.hidive.com/watch/c', site: 'HIDIVE' },
    { title: 'Extra', url: 'https://www.crunchyroll.com/watch/x', site: 'Crunchyroll' }
  ], '12');
  assert.equal(offset, 0);
  assert.deepEqual(episodes.map(episode => episode.url), [
    'https://www.crunchyroll.com/watch/b',
    'https://www.crunchyroll.com/watch/a',
    'https://www.crunchyroll.com/watch/x'
  ]);
  assert.deepEqual(episodes.map(episode => episode.number), [2, 1, null]);
  assert.equal(episodes[0].title, 'B');
});

test('crunchyrollLink prefers STREAMING links and upgrades to https', () => {
  assert.equal(crunchyrollLink({ externalLinks: [
    { site: 'Crunchyroll', url: 'http://www.crunchyroll.com/old', type: 'INFO' },
    { site: 'Crunchyroll', url: 'http://www.crunchyroll.com/series/G1', type: 'STREAMING' },
    { site: 'Netflix', url: 'https://www.netflix.com/title/1', type: 'STREAMING' }
  ] }), 'https://www.crunchyroll.com/series/G1');
  assert.equal(crunchyrollLink({ externalLinks: [{ site: 'Netflix', url: 'https://n', type: 'STREAMING' }] }), '');
  assert.equal(crunchyrollLink(undefined), '');
  assert.equal(toHttps('http://a.example/x'), 'https://a.example/x');
});

const mediaWithEpisodes = (idMal, count = 2) => ({
  id: idMal * 10,
  idMal,
  externalLinks: [{ site: 'Crunchyroll', url: `http://www.crunchyroll.com/series/G${idMal}`, type: 'STREAMING' }],
  streamingEpisodes: Array.from({ length: count }, (_, i) => ({
    title: `Episode ${i + 1} - T${i + 1}`, url: `https://www.crunchyroll.com/watch/${idMal}-${i + 1}`, site: 'Crunchyroll'
  }))
});

test('applyCrunchyroll fills the sub-object and flips status without touching YouTube fields', () => {
  const item = {
    id: 'x', malId: 7, episodes: '12', status: 'upcoming', confidence: 'imported_from_jikan',
    platform: 'ยังไม่ประกาศ', channel: 'ยังไม่ประกาศช่องทางไทย', updateStatus: 'no_playlist', availableEpisodes: []
  };
  applyCrunchyroll(item, mediaWithEpisodes(7), () => '2026-07-04T00:00:00.000Z');
  assert.equal(item.crunchyroll.seriesUrl, 'https://www.crunchyroll.com/series/G7');
  assert.equal(item.crunchyroll.updateStatus, 'ok');
  assert.equal(item.crunchyroll.episodeCount, 2);
  assert.equal(item.crunchyroll.latestEpisodeNumber, 2);
  assert.equal(item.crunchyroll.lastCheckedAt, '2026-07-04T00:00:00.000Z');
  assert.equal(item.status, 'available');
  assert.equal(item.confidence, 'confirmed_from_crunchyroll');
  // YouTube-owned fields stay untouched
  assert.equal(item.platform, 'ยังไม่ประกาศ');
  assert.equal(item.channel, 'ยังไม่ประกาศช่องทางไทย');
  assert.equal(item.updateStatus, 'no_playlist');
});

test('applyCrunchyroll keeps YouTube-driven status/confidence when a YouTube source exists', () => {
  const item = {
    id: 'y', malId: 8, episodes: '12', status: 'available', confidence: 'confirmed_from_youtube_playlist',
    playlistId: 'PL1', availableEpisodes: [{ number: 1 }]
  };
  applyCrunchyroll(item, mediaWithEpisodes(8));
  assert.equal(item.confidence, 'confirmed_from_youtube_playlist');
  assert.equal(item.status, 'available');
  assert.ok(item.crunchyroll);
});

test('applyCrunchyroll marks link without episodes as no_episode_found and does not flip status', () => {
  const item = { id: 'z', malId: 9, episodes: '12', status: 'upcoming', availableEpisodes: [] };
  applyCrunchyroll(item, { ...mediaWithEpisodes(9, 0), streamingEpisodes: [] });
  assert.equal(item.crunchyroll.updateStatus, 'no_episode_found');
  assert.equal(item.status, 'upcoming');
});

test('applyCrunchyroll removes the sub-object and reverts CR-driven status when the link disappears', () => {
  const item = {
    id: 'w', malId: 10, episodes: '12', status: 'available', confidence: 'confirmed_from_crunchyroll',
    availableEpisodes: [], crunchyroll: { seriesUrl: 'https://www.crunchyroll.com/series/old' }
  };
  applyCrunchyroll(item, undefined);
  assert.equal(item.crunchyroll, undefined);
  assert.equal(item.status, 'upcoming');
  assert.equal(item.confidence, 'imported_from_jikan');
  // ...but never reverts a YouTube-confirmed item
  const ytItem = {
    id: 'v', malId: 11, status: 'available', confidence: 'confirmed_from_youtube_playlist',
    playlistId: 'PL2', availableEpisodes: [{ number: 1 }], crunchyroll: { seriesUrl: 'https://x' }
  };
  applyCrunchyroll(ytItem, undefined);
  assert.equal(ytItem.crunchyroll, undefined);
  assert.equal(ytItem.status, 'available');
});

test('fetchCrunchyrollMedia chunks ids, paginates, and isolates failed chunks', async () => {
  const calls = [];
  const ids = Array.from({ length: 60 }, (_, i) => i + 1);
  const requester = async (query, variables) => {
    calls.push(variables);
    if (variables.ids.includes(51)) throw new Error('boom');
    if (variables.ids.length === 50 && variables.page === 1) {
      return { data: { Page: { pageInfo: { hasNextPage: true }, media: [mediaWithEpisodes(1)] } } };
    }
    return { data: { Page: { pageInfo: { hasNextPage: false }, media: [mediaWithEpisodes(2)] } } };
  };
  const { found, failedIds } = await fetchCrunchyrollMedia(ids, requester);
  assert.deepEqual(calls.map(call => [call.ids.length, call.page]), [[50, 1], [50, 2], [10, 1]]);
  assert.ok(found.has(1) && found.has(2));
  assert.equal(failedIds.size, 10);
  assert.ok(failedIds.has(51) && failedIds.has(60));
});

test('chunk splits arrays into fixed-size groups', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});

test('updateCrunchyrollItems targets in-window TV entries and flags stale data on failure', async () => {
  const anime = [
    { id: 'a', malId: 1, jikanType: 'TV', catalogYear: 2026, episodes: '12', status: 'upcoming', availableEpisodes: [] },
    { id: 'b', malId: 2, jikanType: 'TV', catalogYear: 2025, episodes: '12', availableEpisodes: [] },
    { id: 'c', malId: 3, jikanType: 'Movie', catalogYear: 2026, availableEpisodes: [] },
    { id: 'd', jikanType: 'TV', catalogYear: 2026, availableEpisodes: [] },
    { id: 'e', malId: 4, jikanType: 'TV', catalogYear: 2026, episodes: '12', availableEpisodes: [], crunchyroll: { seriesUrl: 'https://x', updateStatus: 'ok', updateError: '' } }
  ];
  const requester = async (query, variables) => {
    if (variables.ids.includes(4)) {
      // simulate the whole batch failing while a stale entry exists
      throw new Error('AniList down');
    }
    return { data: { Page: { pageInfo: { hasNextPage: false }, media: [mediaWithEpisodes(1)] } } };
  };
  // ids 1 and 4 are in-window; they share one chunk, so the failure hits both
  const summary = await updateCrunchyrollItems(anime, [2026], requester);
  assert.equal(summary.targets, 2);
  assert.equal(anime[0].crunchyroll, undefined); // failed chunk: nothing applied, nothing invented
  assert.equal(anime[4].crunchyroll.updateStatus, 'error');
  assert.equal(anime[4].crunchyroll.updateError, 'AniList request failed');
  assert.equal(anime[1].crunchyroll, undefined); // out of window: untouched
  assert.equal(anime[2].crunchyroll, undefined); // not TV: untouched

  const okRequester = async () => ({ data: { Page: { pageInfo: { hasNextPage: false }, media: [mediaWithEpisodes(1)] } } });
  const okSummary = await updateCrunchyrollItems(anime, [2026], okRequester);
  assert.equal(okSummary.onCrunchyroll, 1);
  assert.equal(okSummary.withEpisodes, 1);
  assert.equal(anime[0].crunchyroll.updateStatus, 'ok');
  assert.equal(anime[0].status, 'available');
  assert.equal(anime[4].crunchyroll, undefined); // no CR link on AniList anymore -> removed
});
