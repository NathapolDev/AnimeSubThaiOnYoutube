const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEpisodeList, episodeNumber, fetchPlaylist, isEpisode, updateAnimeItems } = require('./update-youtube');
const { thaiBroadcastTime } = require('./update-jikan');

function playlistItem(title, videoId, publishedAt = '2026-07-01T00:00:00Z') {
  return { snippet: { title }, contentDetails: { videoId, videoPublishedAt: publishedAt } };
}

test('extracts Thai and English episode numbers', () => {
  assert.equal(episodeNumber('เรื่องนี้ ตอนที่ 12'), 12);
  assert.equal(episodeNumber('Series ตอน 3'), 3);
  assert.equal(episodeNumber('Series EP. 7'), 7);
  assert.equal(episodeNumber('Episode 9'), 9);
  assert.equal(episodeNumber('Series #4'), 4);
});

test('ignores year-like hashtag numbers', () => {
  assert.equal(episodeNumber('Anime แนะนำ #2026'), null);
  assert.equal(episodeNumber('Anime ตอนที่ 3 #2026'), 3);
});

test('retries transient YouTube API failures before succeeding', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ items: [{ id: 1 }] }) };
  };
  try {
    assert.deepEqual(await fetchPlaylist('playlist', 'key'), [{ id: 1 }]);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('converts Jikan JST broadcasts to Thailand day and time', () => {
  assert.equal(thaiBroadcastTime({ day: 'Fridays', time: '21:30' }), 'ศุกร์ 19:30');
  assert.equal(thaiBroadcastTime({ day: 'Mondays', time: '01:00' }), 'อาทิตย์ 23:00');
  assert.equal(thaiBroadcastTime({ day: null, time: null }), '');
});

test('filters promotional and unavailable videos', () => {
  for (const title of ['Official Trailer', 'PV 2', 'Opening Theme', 'ED Music', 'Private video', 'Deleted video']) {
    assert.equal(isEpisode(title), false, title);
  }
  assert.equal(isEpisode('Anime ตอนที่ 1'), true);
});

test('deduplicates and sorts numbered episodes while retaining unnumbered items', () => {
  const result = buildEpisodeList([
    playlistItem('Anime ตอนที่ 1', 'a', '2026-07-01T00:00:00Z'),
    playlistItem('Anime ตอนที่ 3', 'c', '2026-07-03T00:00:00Z'),
    playlistItem('Anime ตอนที่ 2', 'b', '2026-07-02T00:00:00Z'),
    playlistItem('Anime ตอนที่ 3 duplicate', 'c', '2026-07-03T00:00:00Z'),
    playlistItem('Special full episode', 's', '2026-07-04T00:00:00Z')
  ], 'playlist');
  assert.deepEqual(result.map(item => item.videoId), ['c', 'b', 'a', 's']);
  assert.equal(result[0].videoUrl, 'https://www.youtube.com/watch?v=c&list=playlist');
  assert.equal(result[3].number, null);
});

test('assigns chronological fallback numbers when no title has an episode number', () => {
  const result = buildEpisodeList([
    playlistItem('Chapter newest', 'b', '2026-07-02T00:00:00Z'),
    playlistItem('Chapter oldest', 'a', '2026-07-01T00:00:00Z')
  ], 'playlist');
  assert.deepEqual(result.map(item => [item.videoId, item.number]), [['b', 2], ['a', 1]]);
});

test('fetches every playlist page', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    const secondPage = String(url).includes('pageToken=next');
    return { ok: true, json: async () => secondPage ? { items: [{ id: 2 }] } : { items: [{ id: 1 }], nextPageToken: 'next' } };
  };
  try {
    assert.deepEqual(await fetchPlaylist('playlist', 'key'), [{ id: 1 }, { id: 2 }]);
    assert.equal(requested.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('preserves cached episodes after an API error and continues with the next anime', async () => {
  const cached = [{ number: 1, title: 'Cached', videoId: 'old', videoUrl: 'https://youtu.be/old', publishedAt: '' }];
  const anime = [
    { id: 'broken', playlistId: 'broken', availableEpisodes: cached },
    { id: 'working', playlistId: 'working', availableEpisodes: [] }
  ];
  await updateAnimeItems(anime, 'key', async playlistId => {
    if (playlistId === 'broken') throw new Error('quota error');
    return [playlistItem('Anime EP 1', 'new')];
  });
  assert.equal(anime[0].updateStatus, 'error');
  assert.deepEqual(anime[0].availableEpisodes, cached);
  assert.equal(anime[1].updateStatus, 'ok');
  assert.equal(anime[1].availableEpisodes[0].videoId, 'new');
});

test('clears stale latest fields after a successful empty playlist response', async () => {
  const anime = [{
    id: 'empty', playlistId: 'empty', currentEpisode: 4, latestEpisodeTitle: 'Old',
    latestVideoUrl: 'https://youtu.be/old', latestPublishedAt: '2026-07-01T00:00:00Z',
    availableEpisodes: [{ videoId: 'old' }]
  }];
  await updateAnimeItems(anime, 'key', async () => []);
  assert.equal(anime[0].updateStatus, 'no_episode_found');
  assert.deepEqual(anime[0].availableEpisodes, []);
  assert.equal(anime[0].currentEpisode, 0);
  assert.equal(anime[0].latestVideoUrl, '');
});
