const test = require('node:test');
const assert = require('node:assert/strict');
const { bangkokYear, fetchYear, syncCatalog } = require('./update-jikan');
const { applyDiscoveries, fetchChannelUploads, matchVideoToAnime, mergeEpisodes } = require('./discover-youtube');

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
