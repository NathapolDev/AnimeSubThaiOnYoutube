const test = require('node:test');
const assert = require('node:assert/strict');
const { pruneAnime, pruneItem } = require('./prune-non-episodes');

function episode(number, title, videoId, publishedAt = '2026-07-01T00:00:00Z') {
  return { number, title, videoId, videoUrl: `https://www.youtube.com/watch?v=${videoId}`, publishedAt };
}

test('drops highlight/short/recap clips and recomputes the latest fields', () => {
  const item = {
    id: 'mixed', status: 'available', currentEpisode: 9,
    latestEpisodeTitle: 'สรุปใน 3 นาที ... ตอนที่ 3', latestVideoUrl: 'https://youtu.be/recap',
    availableEpisodes: [
      episode(9, 'Anime ตอนที่ 9 [ซับไทย]', 'e9', '2026-07-09T00:00:00Z'),
      episode(3, 'สรุปใน 3 นาที ... ตอนที่ 3', 'recap', '2026-07-08T00:00:00Z'),
      episode(2, 'Anime #Shorts ตอนที่ 2', 'short', '2026-07-02T00:00:00Z'),
      episode(1, 'Anime ตอนที่ 1 [ซับไทย]', 'e1', '2026-07-01T00:00:00Z')
    ]
  };
  assert.equal(pruneItem(item), true);
  assert.deepEqual(item.availableEpisodes.map(e => e.videoId), ['e9', 'e1']);
  assert.equal(item.currentEpisode, 9);
  assert.equal(item.latestEpisodeTitle, 'Anime ตอนที่ 9 [ซับไทย]');
  assert.equal(item.latestVideoUrl, 'https://www.youtube.com/watch?v=e9');
});

test('resets an item to no-episode state when every clip is filtered out', () => {
  const item = {
    id: 'highlights-only', status: 'available', currentEpisode: 8,
    latestEpisodeTitle: 'ไฮไลท์ ตอนที่ 8', latestVideoUrl: 'https://youtu.be/hl', latestPublishedAt: '2026-05-25T04:00:38Z',
    availableEpisodes: [
      episode(8, 'น้องสาวแท้ ๆ | ไฮไลท์อนิเมะยมลแห่งยมโลก ตอนที่ 8', 'a'),
      episode(8, 'ยมลคู่ใหม่มาแล้ว | ไฮไลท์อนิเมะยมลแห่งยมโลก ตอนที่ 8', 'b')
    ]
  };
  assert.equal(pruneItem(item), true);
  assert.deepEqual(item.availableEpisodes, []);
  assert.equal(item.currentEpisode, 0);
  assert.equal(item.latestEpisodeTitle, '');
  assert.equal(item.latestVideoUrl, '');
  assert.equal(item.updateStatus, 'no_episode_found');
  assert.equal(item.status, 'upcoming');
});

test('leaves clean episode lists untouched', () => {
  const item = {
    id: 'clean', currentEpisode: 2,
    availableEpisodes: [episode(2, 'Anime ตอนที่ 2', 'x'), episode(1, 'Anime ตอนที่ 1', 'y')]
  };
  assert.equal(pruneItem(item), false);
  assert.equal(item.availableEpisodes.length, 2);
});

test('pruneAnime reports only the ids it changed', () => {
  const anime = [
    { id: 'a', availableEpisodes: [episode(1, 'Anime ตอนที่ 1', 'a1')] },
    { id: 'b', availableEpisodes: [episode(1, 'ไฮไลท์ ตอนที่ 1', 'b1')] }
  ];
  assert.deepEqual(pruneAnime(anime), ['b']);
});
