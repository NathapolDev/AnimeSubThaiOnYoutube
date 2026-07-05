const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PLATFORMS,
  airedEpisodeCount,
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
} = require('./update-streaming-platforms');

const CRUNCHYROLL = PLATFORMS.find(platform => platform.key === 'crunchyroll');
const BILIBILI = PLATFORMS.find(platform => platform.key === 'bilibili');

test('parseEpisodeTitle handles dash, no-dash, decimal, and unparseable titles', () => {
  assert.deepEqual(parseEpisodeTitle('Episode 48 - The Beginning'), { rawNumber: 48, episodeTitle: 'The Beginning' });
  assert.deepEqual(parseEpisodeTitle('Episode 3'), { rawNumber: 3, episodeTitle: '' });
  assert.deepEqual(parseEpisodeTitle('Episode 12.5 - Recap'), { rawNumber: 12.5, episodeTitle: 'Recap' });
  assert.deepEqual(parseEpisodeTitle('Special - Bonus'), { rawNumber: null, episodeTitle: 'Special - Bonus' });
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

test('normalizeEpisodeNumbers keeps decimal specials out of offset detection', () => {
  // a lone decimal special must never be mistaken for absolute sequel numbering
  const soloSpecial = [{ rawNumber: 12.5 }];
  const soloResult = normalizeEpisodeNumbers(soloSpecial, '12');
  assert.equal(soloResult.offset, 0);
  assert.equal(soloResult.episodes[0].number, 12.5);
  // mixed with a real sequel sequence, the offset is still derived from
  // integers only, and the decimal special shifts along with them
  const mixed = [
    ...Array.from({ length: 24 }, (_, i) => ({ rawNumber: 25 + i })),
    { rawNumber: 24.5 }
  ];
  const mixedResult = normalizeEpisodeNumbers(mixed, '24');
  assert.equal(mixedResult.offset, 24);
  assert.equal(mixedResult.episodes.find(e => e.rawNumber === 24.5).number, 0.5);
});

test('buildEpisodeList filters to the given site, dedupes by url, upgrades http, sorts newest-first', () => {
  const { episodes, offset } = buildEpisodeList([
    { title: 'Episode 1 - A', url: 'http://www.crunchyroll.com/watch/a', site: 'Crunchyroll' },
    { title: 'Episode 2 - B', url: 'https://www.crunchyroll.com/watch/b', site: 'Crunchyroll' },
    { title: 'Episode 2 - B dup', url: 'http://www.crunchyroll.com/watch/b', site: 'Crunchyroll' },
    { title: 'Episode 3 - C', url: 'https://www.hidive.com/watch/c', site: 'HIDIVE' },
    { title: 'Extra', url: 'https://www.crunchyroll.com/watch/x', site: 'Crunchyroll' }
  ], '12', 'Crunchyroll');
  assert.equal(offset, 0);
  assert.deepEqual(episodes.map(episode => episode.url), [
    'https://www.crunchyroll.com/watch/b',
    'https://www.crunchyroll.com/watch/a',
    'https://www.crunchyroll.com/watch/x'
  ]);
  assert.deepEqual(episodes.map(episode => episode.number), [2, 1, null]);
  assert.equal(episodes[0].title, 'B');
});

test('buildEpisodeList filters by site independently, e.g. Bilibili TV vs Crunchyroll', () => {
  const streamingEpisodes = [
    { title: 'Episode 1 - A', url: 'https://www.crunchyroll.com/watch/a', site: 'Crunchyroll' },
    { title: 'Episode 1 - A', url: 'https://www.bilibili.tv/en/play/1/1', site: 'Bilibili TV' },
    { title: 'Episode 2 - B', url: 'https://www.bilibili.tv/en/play/1/2', site: 'Bilibili TV' }
  ];
  const cr = buildEpisodeList(streamingEpisodes, '12', 'Crunchyroll');
  const bili = buildEpisodeList(streamingEpisodes, '12', 'Bilibili TV');
  assert.equal(cr.episodes.length, 1);
  assert.equal(cr.episodes[0].url, 'https://www.crunchyroll.com/watch/a');
  assert.equal(bili.episodes.length, 2);
  assert.deepEqual(bili.episodes.map(episode => episode.number), [2, 1]);
});

test('buildEpisodeList drops trailers and other non-episode entries', () => {
  const { episodes } = buildEpisodeList([
    { title: 'Episode  - Some Movie | Trailer', url: 'https://www.crunchyroll.com/watch/trailer', site: 'Crunchyroll' },
    { title: 'Episode 5 - Real one', url: 'https://www.crunchyroll.com/watch/e5', site: 'Crunchyroll' }
  ], '12', 'Crunchyroll');
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].url, 'https://www.crunchyroll.com/watch/e5');
});

test('buildEpisodeList returns nothing when the only link for the site is a trailer', () => {
  const { episodes } = buildEpisodeList([
    { title: 'Trailer', url: 'https://www.crunchyroll.com/watch/trailer-only', site: 'Crunchyroll' }
  ], '12', 'Crunchyroll');
  assert.equal(episodes.length, 0);
});

test('platformLink prefers STREAMING links and upgrades to https, filtered by site', () => {
  assert.equal(platformLink({ externalLinks: [
    { site: 'Crunchyroll', url: 'http://www.crunchyroll.com/old', type: 'INFO' },
    { site: 'Crunchyroll', url: 'http://www.crunchyroll.com/series/G1', type: 'STREAMING' },
    { site: 'Netflix', url: 'https://www.netflix.com/title/1', type: 'STREAMING' }
  ] }, 'Crunchyroll'), 'https://www.crunchyroll.com/series/G1');
  assert.equal(platformLink({ externalLinks: [{ site: 'Netflix', url: 'https://n', type: 'STREAMING' }] }, 'Crunchyroll'), '');
  assert.equal(platformLink(undefined, 'Crunchyroll'), '');
  assert.equal(platformLink({ externalLinks: [
    { site: 'Bilibili', url: 'http://www.bilibili.com/anime/1', type: 'STREAMING' },
    { site: 'Bilibili TV', url: 'http://www.bilibili.tv/en/media/1', type: 'STREAMING' }
  ] }, 'Bilibili TV'), 'https://www.bilibili.tv/en/media/1');
  assert.equal(toHttps('http://a.example/x'), 'https://a.example/x');
});

test('airedEpisodeCount derives aired episodes from the AniList schedule', () => {
  assert.equal(airedEpisodeCount({ status: 'RELEASING', nextAiringEpisode: { episode: 2 } }), 1);
  assert.equal(airedEpisodeCount({ status: 'RELEASING', nextAiringEpisode: { episode: 1 } }), 0);
  assert.equal(airedEpisodeCount({ status: 'RELEASING', nextAiringEpisode: null }), 0);
  assert.equal(airedEpisodeCount({ status: 'FINISHED', episodes: 13 }), 13);
  assert.equal(airedEpisodeCount({ status: 'FINISHED', episodes: null }), 0);
  assert.equal(airedEpisodeCount({ status: 'NOT_YET_RELEASED', episodes: 12 }), 0);
  assert.equal(airedEpisodeCount(undefined), 0);
});

const mediaWithEpisodes = (idMal, count = 2) => ({
  id: idMal * 10,
  idMal,
  externalLinks: [{ site: 'Crunchyroll', url: `http://www.crunchyroll.com/series/G${idMal}`, type: 'STREAMING' }],
  streamingEpisodes: Array.from({ length: count }, (_, i) => ({
    title: `Episode ${i + 1} - T${i + 1}`, url: `https://www.crunchyroll.com/watch/${idMal}-${i + 1}`, site: 'Crunchyroll'
  }))
});

const mediaWithBothPlatforms = (idMal, crCount = 2, biliCount = 0) => ({
  id: idMal * 10,
  idMal,
  externalLinks: [
    { site: 'Crunchyroll', url: `http://www.crunchyroll.com/series/G${idMal}`, type: 'STREAMING' },
    { site: 'Bilibili TV', url: `http://www.bilibili.tv/en/media/${idMal}`, type: 'STREAMING' }
  ],
  streamingEpisodes: [
    ...Array.from({ length: crCount }, (_, i) => ({
      title: `Episode ${i + 1} - T${i + 1}`, url: `https://www.crunchyroll.com/watch/${idMal}-${i + 1}`, site: 'Crunchyroll'
    })),
    ...Array.from({ length: biliCount }, (_, i) => ({
      title: `Episode ${i + 1} - T${i + 1}`, url: `https://www.bilibili.tv/en/play/${idMal}/${i + 1}`, site: 'Bilibili TV'
    }))
  ]
});

test('applyPlatform fills the sub-object and flips status without touching YouTube fields', () => {
  const item = {
    id: 'x', malId: 7, episodes: '12', status: 'upcoming', confidence: 'imported_from_jikan',
    platform: 'ยังไม่ประกาศ', channel: 'ยังไม่ประกาศช่องทางไทย', updateStatus: 'no_playlist', availableEpisodes: []
  };
  applyPlatform(item, mediaWithEpisodes(7), CRUNCHYROLL, () => '2026-07-04T00:00:00.000Z');
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

test('applyPlatform keeps YouTube-driven status/confidence when a YouTube source exists', () => {
  const item = {
    id: 'y', malId: 8, episodes: '12', status: 'available', confidence: 'confirmed_from_youtube_playlist',
    playlistId: 'PL1', availableEpisodes: [{ number: 1 }]
  };
  applyPlatform(item, mediaWithEpisodes(8), CRUNCHYROLL);
  assert.equal(item.confidence, 'confirmed_from_youtube_playlist');
  assert.equal(item.status, 'available');
  assert.ok(item.crunchyroll);
});

test('applyPlatform marks link without episodes as no_episode_found and does not flip status', () => {
  const item = { id: 'z', malId: 9, episodes: '12', status: 'upcoming', availableEpisodes: [] };
  applyPlatform(item, { ...mediaWithEpisodes(9, 0), streamingEpisodes: [], status: 'NOT_YET_RELEASED', episodes: 12 }, CRUNCHYROLL);
  assert.equal(item.crunchyroll.updateStatus, 'no_episode_found');
  assert.equal(item.crunchyroll.episodeSource, '');
  assert.equal(item.status, 'upcoming');
});

test('applyPlatform estimates episode count from the airing schedule when links are missing', () => {
  const item = { id: 'est', malId: 12, episodes: '12', status: 'upcoming', confidence: 'imported_from_jikan', availableEpisodes: [] };
  const media = {
    ...mediaWithEpisodes(12, 0), streamingEpisodes: [],
    status: 'RELEASING', episodes: 12, nextAiringEpisode: { episode: 2 }
  };
  applyPlatform(item, media, CRUNCHYROLL, () => '2026-07-05T00:00:00.000Z');
  assert.deepEqual(item.crunchyroll.availableEpisodes, []);
  assert.equal(item.crunchyroll.episodeCount, 1);
  assert.equal(item.crunchyroll.latestEpisodeNumber, 1);
  assert.equal(item.crunchyroll.episodeSource, 'estimated_from_airing');
  assert.equal(item.crunchyroll.updateStatus, 'ok');
  assert.equal(item.status, 'available');
  assert.equal(item.confidence, 'confirmed_from_crunchyroll');
});

test('applyPlatform falls back to the airing estimate when the only link for the site is a trailer', () => {
  const item = { id: 'trailer-only', malId: 16, episodes: '12', status: 'upcoming', availableEpisodes: [] };
  const media = {
    ...mediaWithEpisodes(16, 0),
    streamingEpisodes: [{ title: 'Trailer', url: 'https://www.crunchyroll.com/watch/trailer', site: 'Crunchyroll' }],
    status: 'RELEASING', episodes: 12, nextAiringEpisode: { episode: 2 }
  };
  applyPlatform(item, media, CRUNCHYROLL);
  assert.equal(item.crunchyroll.episodeSource, 'estimated_from_airing');
  assert.equal(item.crunchyroll.episodeCount, 1);
  assert.deepEqual(item.crunchyroll.availableEpisodes, []);
});

test('applyPlatform prefers real AniList episode links over the estimate', () => {
  const item = { id: 'real', malId: 13, episodes: '12', status: 'upcoming', availableEpisodes: [] };
  const media = { ...mediaWithEpisodes(13, 2), status: 'RELEASING', episodes: 12, nextAiringEpisode: { episode: 9 } };
  applyPlatform(item, media, CRUNCHYROLL);
  assert.equal(item.crunchyroll.episodeSource, 'anilist_links');
  assert.equal(item.crunchyroll.episodeCount, 2);
  assert.equal(item.crunchyroll.availableEpisodes.length, 2);
});

test('applyPlatform reverts platform-only status when the link stays but episodes drop to zero', () => {
  const item = {
    id: 'zero', malId: 14, episodes: '12', status: 'available', confidence: 'confirmed_from_crunchyroll',
    availableEpisodes: [], crunchyroll: { seriesUrl: 'https://www.crunchyroll.com/series/old', episodeCount: 3 }
  };
  const media = { ...mediaWithEpisodes(14, 0), streamingEpisodes: [], status: 'NOT_YET_RELEASED', episodes: 12 };
  applyPlatform(item, media, CRUNCHYROLL);
  assert.equal(item.crunchyroll.updateStatus, 'no_episode_found');
  assert.equal(item.status, 'upcoming');
  assert.equal(item.confidence, 'imported_from_jikan');
});

test('applyPlatform does not revert status when a YouTube source backs the item even if the platform drops to zero episodes', () => {
  const item = {
    id: 'yt-backed', malId: 15, episodes: '12', status: 'available', confidence: 'confirmed_from_youtube_playlist',
    playlistId: 'PL3', availableEpisodes: [{ number: 1 }], crunchyroll: { seriesUrl: 'https://www.crunchyroll.com/series/old' }
  };
  const media = { ...mediaWithEpisodes(15, 0), streamingEpisodes: [], status: 'NOT_YET_RELEASED', episodes: 12 };
  applyPlatform(item, media, CRUNCHYROLL);
  assert.equal(item.crunchyroll.updateStatus, 'no_episode_found');
  assert.equal(item.status, 'available');
  assert.equal(item.confidence, 'confirmed_from_youtube_playlist');
});

test('applyPlatform removes the sub-object and reverts platform-driven status when the link disappears', () => {
  const item = {
    id: 'w', malId: 10, episodes: '12', status: 'available', confidence: 'confirmed_from_crunchyroll',
    availableEpisodes: [], crunchyroll: { seriesUrl: 'https://www.crunchyroll.com/series/old' }
  };
  applyPlatform(item, undefined, CRUNCHYROLL);
  assert.equal(item.crunchyroll, undefined);
  assert.equal(item.status, 'upcoming');
  assert.equal(item.confidence, 'imported_from_jikan');
  // ...but never reverts a YouTube-confirmed item
  const ytItem = {
    id: 'v', malId: 11, status: 'available', confidence: 'confirmed_from_youtube_playlist',
    playlistId: 'PL2', availableEpisodes: [{ number: 1 }], crunchyroll: { seriesUrl: 'https://x' }
  };
  applyPlatform(ytItem, undefined, CRUNCHYROLL);
  assert.equal(ytItem.crunchyroll, undefined);
  assert.equal(ytItem.status, 'available');
});

test('applyPlatform fills item.bilibili and claims status/confidence when nothing else backs the item', () => {
  const item = { id: 'bili-only', malId: 20, episodes: '12', status: 'upcoming', confidence: 'imported_from_jikan', availableEpisodes: [] };
  applyPlatform(item, mediaWithBothPlatforms(20, 0, 3), BILIBILI, () => '2026-07-05T00:00:00.000Z');
  assert.equal(item.bilibili.seriesUrl, 'https://www.bilibili.tv/en/media/20');
  assert.equal(item.bilibili.episodeCount, 3);
  assert.equal(item.status, 'available');
  assert.equal(item.confidence, 'confirmed_from_bilibili');
});

test('applyPlatform does not let Bilibili claim status/confidence when Crunchyroll already confirmed the item in the same run', () => {
  const item = { id: 'both', malId: 21, episodes: '12', status: 'upcoming', confidence: 'imported_from_jikan', availableEpisodes: [] };
  const media = mediaWithBothPlatforms(21, 2, 3);
  applyPlatform(item, media, CRUNCHYROLL);
  applyPlatform(item, media, BILIBILI);
  assert.ok(item.bilibili.episodeCount > 0);
  assert.equal(item.confidence, 'confirmed_from_crunchyroll');
  assert.equal(item.status, 'available');
});

test('applyPlatform lets Bilibili claim status/confidence when Crunchyroll has no episodes', () => {
  const item = { id: 'bili-wins', malId: 22, episodes: '12', status: 'upcoming', confidence: 'imported_from_jikan', availableEpisodes: [] };
  const media = mediaWithBothPlatforms(22, 0, 3);
  applyPlatform(item, media, CRUNCHYROLL);
  applyPlatform(item, media, BILIBILI);
  assert.equal(item.crunchyroll.updateStatus, 'no_episode_found');
  assert.equal(item.confidence, 'confirmed_from_bilibili');
  assert.equal(item.status, 'available');
});

test('applyPlatform estimates Bilibili episode count from the airing schedule (the common case today)', () => {
  const item = { id: 'bili-est', malId: 23, episodes: '12', status: 'upcoming', confidence: 'imported_from_jikan', availableEpisodes: [] };
  const media = { ...mediaWithBothPlatforms(23, 0, 0), status: 'RELEASING', episodes: 12, nextAiringEpisode: { episode: 4 } };
  applyPlatform(item, media, BILIBILI);
  assert.equal(item.bilibili.episodeSource, 'estimated_from_airing');
  assert.equal(item.bilibili.episodeCount, 3);
  assert.equal(item.status, 'available');
  assert.equal(item.confidence, 'confirmed_from_bilibili');
});

test('applyPlatform reverts confirmed_from_bilibili when the Bilibili link disappears, but never reverts a YouTube-confirmed item', () => {
  const item = {
    id: 'bili-gone', malId: 24, episodes: '12', status: 'available', confidence: 'confirmed_from_bilibili',
    availableEpisodes: [], bilibili: { seriesUrl: 'https://www.bilibili.tv/en/media/old' }
  };
  applyPlatform(item, undefined, BILIBILI);
  assert.equal(item.bilibili, undefined);
  assert.equal(item.status, 'upcoming');
  assert.equal(item.confidence, 'imported_from_jikan');

  const ytItem = {
    id: 'bili-yt', malId: 25, status: 'available', confidence: 'confirmed_from_youtube_playlist',
    playlistId: 'PL4', availableEpisodes: [{ number: 1 }], bilibili: { seriesUrl: 'https://x' }
  };
  applyPlatform(ytItem, undefined, BILIBILI);
  assert.equal(ytItem.bilibili, undefined);
  assert.equal(ytItem.status, 'available');
});

test('isOutrankedByHigherPlatform reflects the outranks config', () => {
  assert.equal(isOutrankedByHigherPlatform({}, CRUNCHYROLL), false);
  assert.equal(isOutrankedByHigherPlatform({ crunchyroll: { episodeCount: 2 } }, BILIBILI), true);
  assert.equal(isOutrankedByHigherPlatform({ crunchyroll: { episodeCount: 0 } }, BILIBILI), false);
  assert.equal(isOutrankedByHigherPlatform({}, BILIBILI), false);
});

test('revertPlatformOnlyStatus only reverts a match on that platform\'s own confidence tag', () => {
  const item = { status: 'available', confidence: 'confirmed_from_bilibili' };
  revertPlatformOnlyStatus(item, CRUNCHYROLL);
  assert.equal(item.status, 'available');
  assert.equal(item.confidence, 'confirmed_from_bilibili');
  revertPlatformOnlyStatus(item, BILIBILI);
  assert.equal(item.status, 'upcoming');
  assert.equal(item.confidence, 'imported_from_jikan');
});

test('fetchAnilistMedia chunks ids, paginates, and isolates failed chunks', async () => {
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
  const { found, failedIds } = await fetchAnilistMedia(ids, requester);
  assert.deepEqual(calls.map(call => [call.ids.length, call.page]), [[50, 1], [50, 2], [10, 1]]);
  assert.ok(found.has(1) && found.has(2));
  assert.equal(failedIds.size, 10);
  assert.ok(failedIds.has(51) && failedIds.has(60));
});

test('chunk splits arrays into fixed-size groups', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});

test('updateStreamingPlatformItems targets in-window TV entries and flags stale data on failure', async () => {
  const anime = [
    { id: 'a', malId: 1, jikanType: 'TV', catalogYear: 2026, episodes: '12', status: 'upcoming', availableEpisodes: [] },
    { id: 'b', malId: 2, jikanType: 'TV', catalogYear: 2025, episodes: '12', availableEpisodes: [] },
    { id: 'c', malId: 3, jikanType: 'Movie', catalogYear: 2026, availableEpisodes: [] },
    { id: 'd', jikanType: 'TV', catalogYear: 2026, availableEpisodes: [] },
    {
      id: 'e', malId: 4, jikanType: 'TV', catalogYear: 2026, episodes: '12', availableEpisodes: [],
      crunchyroll: { seriesUrl: 'https://x', updateStatus: 'ok', updateError: '' },
      bilibili: { seriesUrl: 'https://y', updateStatus: 'ok', updateError: '' }
    }
  ];
  const requester = async (query, variables) => {
    if (variables.ids.includes(4)) {
      // simulate the whole batch failing while a stale entry exists
      throw new Error('AniList down');
    }
    return { data: { Page: { pageInfo: { hasNextPage: false }, media: [mediaWithBothPlatforms(1)] } } };
  };
  // ids 1 and 4 are in-window; they share one chunk, so the failure hits both
  const summary = await updateStreamingPlatformItems(anime, [2026], requester);
  assert.equal(summary.targets, 2);
  assert.equal(anime[0].crunchyroll, undefined); // failed chunk: nothing applied, nothing invented
  assert.equal(anime[0].bilibili, undefined);
  assert.equal(anime[4].crunchyroll.updateStatus, 'error');
  assert.equal(anime[4].crunchyroll.updateError, 'AniList request failed');
  assert.equal(anime[4].bilibili.updateStatus, 'error'); // both stale platform fields flagged from one failure
  assert.equal(anime[1].crunchyroll, undefined); // out of window: untouched
  assert.equal(anime[2].crunchyroll, undefined); // not TV: untouched

  const okRequester = async () => ({ data: { Page: { pageInfo: { hasNextPage: false }, media: [mediaWithBothPlatforms(1, 2, 3)] } } });
  const okSummary = await updateStreamingPlatformItems(anime, [2026], okRequester);
  assert.equal(okSummary.byPlatform.crunchyroll.onPlatform, 1);
  assert.equal(okSummary.byPlatform.crunchyroll.withEpisodes, 1);
  assert.equal(okSummary.byPlatform.bilibili.onPlatform, 1);
  assert.equal(okSummary.byPlatform.bilibili.withEpisodes, 1);
  assert.equal(anime[0].crunchyroll.updateStatus, 'ok');
  assert.equal(anime[0].status, 'available');
  assert.equal(anime[0].confidence, 'confirmed_from_crunchyroll'); // Bilibili has episodes too but Crunchyroll outranks it
  assert.equal(anime[4].crunchyroll, undefined); // no CR link on AniList anymore -> removed
  assert.equal(anime[4].bilibili, undefined);
});

test('updateStreamingPlatformItems fetches AniList once and populates both platforms from the same response', async () => {
  const anime = [{ id: 'both', malId: 30, jikanType: 'TV', catalogYear: 2026, episodes: '12', status: 'upcoming', availableEpisodes: [] }];
  const calls = [];
  const requester = async (query, variables) => {
    calls.push(variables);
    return { data: { Page: { pageInfo: { hasNextPage: false }, media: [mediaWithBothPlatforms(30, 2, 3)] } } };
  };
  await updateStreamingPlatformItems(anime, [2026], requester);
  assert.equal(calls.length, 1); // one AniList request backs both platform sub-objects
  assert.ok(anime[0].crunchyroll);
  assert.ok(anime[0].bilibili);
});
