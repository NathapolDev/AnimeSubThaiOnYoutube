const test = require('node:test');
const assert = require('node:assert/strict');
const { bangkokYear, catalogYears, fetchCatalog, fetchYear, syncCatalog } = require('./update-jikan');
const { applyDiscoveries, fetchChannelUploads, matchVideoToAnime, mergeEpisodes, resolveYears } = require('./discover-youtube');

// Bangkok is UTC+7, so a UTC hour of 04:00 keeps the calendar day stable across the conversion.
const bkk = iso => new Date(`${iso}T04:00:00Z`);

test('uses Bangkok year and fetches all four seasons with TV-only deduplication', async () => {
  assert.equal(bangkokYear(new Date('2025-12-31T18:00:00Z')), 2026);
  const calls = [];
  const entries = await fetchYear(2026, async url => {
    calls.push(url);
    const season = url.match(/2026\/(winter|spring|summer|fall)/)[1];
    return { data: [
      { mal_id: season === 'fall' ? 2 : 1, type: 'TV', title: season },
      { mal_id: 99, type: 'Movie', title: 'ignored' }
    ], pagination: { has_next_page: false } };
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(entries.map(value => value.anime.mal_id).sort(), [1, 2]);
});

test('catalog year window widens symmetrically around the New Year boundary', () => {
  assert.deepEqual(catalogYears(bkk('2026-07-04')), [2026]);       // mid-year: single year
  assert.deepEqual(catalogYears(bkk('2026-11-15')), [2026, 2027]); // Oct-Dec: upcoming Winter ramping
  assert.deepEqual(catalogYears(bkk('2027-01-10')), [2026, 2027]); // Jan-Feb: prior shows still finishing
  assert.deepEqual(catalogYears(bkk('2027-03-01')), [2027]);       // narrows again once March lands
});

test('resolveYears honors an explicit override and falls back to the automatic window', () => {
  assert.deepEqual(resolveYears(['node', 'x', '--years', '2026,2027']), [2026, 2027]);
  assert.deepEqual(resolveYears(['node', 'x', '--year=2028']), [2028]);
  const auto = resolveYears(['node', 'x']); // no flag -> catalogYears(), never the empty-string [0]
  assert.ok(auto.length && auto.every(Number.isInteger) && !auto.includes(0));
});

test('fetchCatalog pulls the upcoming Winter season only during the year-end ramp', async () => {
  const seasonsFor = async date => {
    const seasons = [];
    await fetchCatalog(date, async url => {
      seasons.push(url.match(/seasons\/(\d+)\/(winter|spring|summer|fall)/).slice(1).join('/'));
      return { data: [], pagination: { has_next_page: false } };
    });
    return seasons;
  };
  assert.deepEqual(await seasonsFor(bkk('2026-07-04')), ['2026/winter', '2026/spring', '2026/summer', '2026/fall']);
  assert.deepEqual(await seasonsFor(bkk('2026-11-15')), ['2026/winter', '2026/spring', '2026/summer', '2026/fall', '2027/winter']);
});

test('fetchCatalog preserves the current-year catalog when upcoming Winter fails', async () => {
  const entries = await fetchCatalog(bkk('2026-11-15'), async url => {
    if (url.includes('/seasons/2027/winter')) throw new Error('upcoming season unavailable');
    const season = url.match(/2026\/(winter|spring|summer|fall)/)[1];
    return {
      data: [{ mal_id: season === 'winter' ? 1 : 2, type: 'TV', title: season }],
      pagination: { has_next_page: false }
    };
  });
  assert.deepEqual(entries.map(entry => entry.anime.mal_id).sort(), [1, 2]);
});

test('catalog sync enriches current entries and preserves archived records', async () => {
  const items = [{ id: 'archive', malId: 5, catalogYear: 2025, availableEpisodes: [{ videoId: 'old' }] }];
  const anime = { mal_id: 6, type: 'TV', title: 'New Show', titles: [], studios: [], genres: [], themes: [], demographics: [], images: {}, aired: {}, broadcast: {} };
  const result = await syncCatalog(items, 2026, [{ anime, season: 'winter' }]);
  assert.equal(result.added, 1);
  assert.equal(items.length, 2);
  assert.equal(items[0].availableEpisodes[0].videoId, 'old');
  assert.equal(items[1].catalogYear, 2026);
});

test('matches a unique normalized alias and rejects equal-score ambiguity', () => {
  const anime = [
    { id: 'a', titleOriginal: 'My Hero Story', youtubeAliases: [] },
    { id: 'b', titleOriginal: 'Another Show', youtubeAliases: [] }
  ];
  assert.equal(matchVideoToAnime({ title: 'My Hero Story ตอนที่ 2' }, anime).match.id, 'a');
  const ambiguous = matchVideoToAnime({ title: 'Shared Name EP 1' }, [
    { id: 'x', titleOriginal: 'Shared Name' }, { id: 'y', titleOriginal: 'Shared Name' }
  ]);
  assert.equal(ambiguous.match, null);
  assert.equal(ambiguous.candidates.length, 2);
});

test('incremental upload scan stops at last seen video', async () => {
  const calls = [];
  const requester = async () => {
    calls.push(1);
    return { items: [
      { snippet: { title: 'Show EP 2' }, contentDetails: { videoId: 'new', videoPublishedAt: '2026-02-02T00:00:00Z' } },
      { snippet: { title: 'Show EP 1' }, contentDetails: { videoId: 'seen', videoPublishedAt: '2026-02-01T00:00:00Z' } }
    ] };
  };
  const result = await fetchChannelUploads({ uploadsPlaylistId: 'uploads' }, { year: 2026, lastSeenVideoId: 'seen' }, 2026, false, 'key', requester);
  assert.deepEqual(result.videos.map(video => video.videoId), ['new']);
  assert.equal(result.reachedBoundary, true);
  assert.equal(calls.length, 1);
});

test('missing last-seen video is bounded to twenty pages', async () => {
  let pages = 0;
  const requester = async () => ({
    items: [{ snippet: { title: 'Unmatched EP 1' }, contentDetails: { videoId: `v${++pages}`, videoPublishedAt: '2026-03-01T00:00:00Z' } }],
    nextPageToken: `p${pages}`
  });
  const result = await fetchChannelUploads({ uploadsPlaylistId: 'uploads' }, { year: 2026, lastSeenVideoId: 'deleted' }, 2026, false, 'key', requester);
  assert.equal(result.pages, 20);
});

test('upload scan spanning the New Year keeps December and drops the prior year', async () => {
  const requester = async () => ({ items: [
    { snippet: { title: 'Winter Show EP 1' }, contentDetails: { videoId: 'jan27', videoPublishedAt: '2027-01-05T00:00:00Z' } },
    { snippet: { title: 'Winter Show PV' }, contentDetails: { videoId: 'dec26', videoPublishedAt: '2026-12-28T00:00:00Z' } },
    { snippet: { title: 'Old Show EP 12' }, contentDetails: { videoId: 'dec25', videoPublishedAt: '2025-12-20T00:00:00Z' } }
  ] });
  const result = await fetchChannelUploads({ uploadsPlaylistId: 'uploads' }, undefined, [2026, 2027], true, 'key', requester);
  assert.deepEqual(result.videos.map(video => video.videoId), ['jan27', 'dec26']);
  assert.equal(result.reachedBoundary, true);
});

test('channel discovery matches next-season anime within the year window', () => {
  const anime = [{ id: 'winter', jikanType: 'TV', playlistId: '', catalogYear: 2027, titleOriginal: 'Next Winter Show', availableEpisodes: [] }];
  const channel = { channelId: 'channel', channelTitle: 'Official', label: 'Muse Thailand' };
  applyDiscoveries(anime, channel, [
    { videoId: 'w1', title: 'Next Winter Show EP 1', publishedAt: '2026-12-29T00:00:00Z' }
  ], [], [2026, 2027]);
  assert.equal(anime[0].youtubeSourceType, 'channel_uploads');
  assert.equal(anime[0].latestVideoUrl, 'https://www.youtube.com/watch?v=w1');
});

test('channel discovery never replaces playlist-backed anime', () => {
  const anime = [
    { id: 'playlist', jikanType: 'TV', playlistId: 'fixed', titleOriginal: 'Playlist Show', availableEpisodes: [{ videoId: 'fixed' }] },
    { id: 'uploads', jikanType: 'TV', playlistId: '', titleOriginal: 'Upload Show', availableEpisodes: [] }
  ];
  const channel = { channelId: 'channel', channelTitle: 'Official', label: 'Muse Thailand' };
  applyDiscoveries(anime, channel, [
    { videoId: 'p', title: 'Playlist Show EP 2', publishedAt: '2026-04-01T00:00:00Z' },
    { videoId: 'u', title: 'Upload Show EP 1', publishedAt: '2026-04-01T00:00:00Z' }
  ], []);
  assert.deepEqual(anime[0].availableEpisodes.map(value => value.videoId), ['fixed']);
  assert.equal(anime[1].latestVideoUrl, 'https://www.youtube.com/watch?v=u');
  assert.equal(anime[1].youtubeSourceType, 'channel_uploads');
});

test('episode merge deduplicates video IDs', () => {
  const merged = mergeEpisodes([{ number: 1, videoId: 'a', publishedAt: '2026-01-01' }], [
    { number: 1, videoId: 'a', publishedAt: '2026-01-01' }, { number: 2, videoId: 'b', publishedAt: '2026-01-02' }
  ]);
  assert.deepEqual(merged.map(value => value.videoId), ['b', 'a']);
});
