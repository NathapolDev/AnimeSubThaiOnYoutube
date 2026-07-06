const test = require('node:test');
const assert = require('node:assert/strict');
const { slimItems } = require('./build-site-data');

// Fields documented in CLAUDE.md as pipeline-only: they may live in
// data/anime.json / data/anime.js, but must never reach the _site payload.
const PIPELINE_ONLY_ITEM_FIELDS = [
  'malId', 'anilistTitles', 'youtubeAliases', 'youtubeMatchConfidence',
  'youtubeMatchType', 'youtubeMatchedAlias', 'youtubeMatchedVideoTitle',
  'youtubeMatchedScore', 'youtubeLastMatchedAt', 'youtubeDiscoveryStatus',
  'youtubeChannelId', 'youtubeChannelTitle', 'youtubeSourceType'
];

test('slimItems strips pipeline-only fields from the site payload', () => {
  const item = {
    id: 'demo', titleThai: 'ชื่อไทย', titleOriginal: 'Demo', status: 'available',
    malId: 123,
    anilistTitles: { romaji: 'Demo', english: 'Demo', native: 'デモ', synonyms: [] },
    youtubeAliases: ['alias'],
    youtubeMatchConfidence: 'strong_unique_title_match',
    youtubeMatchType: 'exact',
    youtubeMatchedAlias: 'ชื่อไทย',
    youtubeMatchedVideoTitle: 'ชื่อไทย ตอนที่ 1',
    youtubeMatchedScore: 7,
    youtubeLastMatchedAt: '2026-07-06T00:00:00.000Z',
    youtubeDiscoveryStatus: 'matched',
    youtubeChannelId: 'UC123', youtubeChannelTitle: 'Ch', youtubeSourceType: 'channel_uploads',
    availableEpisodes: [
      { number: 1, title: 'ตอนที่ 1', videoId: 'v1', videoUrl: 'https://www.youtube.com/watch?v=v1', publishedAt: '2026-07-01T00:00:00Z' }
    ]
  };
  const [slim] = slimItems([item]);
  for (const field of PIPELINE_ONLY_ITEM_FIELDS) {
    assert.ok(!(field in slim), `pipeline-only field "${field}" leaked into the site payload`);
  }
  // Allowlisted fields survive.
  assert.equal(slim.id, 'demo');
  assert.equal(slim.titleThai, 'ชื่อไทย');
  assert.equal(slim.status, 'available');
  assert.equal(slim.availableEpisodes.length, 1);
  assert.equal(slim.availableEpisodes[0].videoUrl, 'https://www.youtube.com/watch?v=v1');
  assert.ok(!('videoId' in slim.availableEpisodes[0]), 'episode-level videoId leaked into the site payload');
});
