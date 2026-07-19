const test = require('node:test');
const assert = require('node:assert/strict');
const { slimItems, splitItems } = require('./build-site-data');
const { availableEpisodeCount } = require('../progress.js');

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

// splitItems divides the slim payload into a first-paint core (no summaries or
// episode lists) and a lazily loaded details map keyed by id.
function makeSlimItem(overrides = {}) {
  return slimItems([{
    id: 'demo', titleThai: 'ชื่อไทย', titleOriginal: 'Demo', status: 'available',
    summary: 'เรื่องย่อ',
    latestVideoUrl: 'https://www.youtube.com/watch?v=latest',
    availableEpisodes: [
      { number: 2, title: 'ตอนที่ 2', videoUrl: 'https://www.youtube.com/watch?v=v2', publishedAt: '2026-07-08T00:00:00Z' },
      { number: 1, title: 'ตอนที่ 1', videoUrl: 'https://www.youtube.com/watch?v=v1', publishedAt: '2026-07-01T00:00:00Z' }
    ],
    crunchyroll: {
      seriesUrl: 'https://www.crunchyroll.com/series/demo',
      episodeCount: 2, latestEpisodeNumber: 2, updateStatus: 'ok',
      availableEpisodes: [{ number: 1, title: 'Ep 1', url: 'https://www.crunchyroll.com/watch/e1' }]
    },
    ...overrides
  }])[0];
}

test('splitItems moves summary and every episode list out of the core payload', () => {
  const slim = makeSlimItem();
  const { core, details } = splitItems([slim]);
  const [coreItem] = core;
  assert.ok(!('summary' in coreItem), 'summary leaked into the core payload');
  assert.ok(!('availableEpisodes' in coreItem), 'availableEpisodes leaked into the core payload');
  assert.ok(!('availableEpisodes' in coreItem.crunchyroll), 'crunchyroll episodes leaked into the core payload');
  // Card-level platform fields survive.
  assert.equal(coreItem.crunchyroll.seriesUrl, 'https://www.crunchyroll.com/series/demo');
  assert.equal(coreItem.crunchyroll.episodeCount, 2);
  assert.equal(coreItem.crunchyroll.latestEpisodeNumber, 2);
  assert.deepEqual(details.demo, {
    summary: 'เรื่องย่อ',
    availableEpisodes: slim.availableEpisodes,
    crunchyroll: { availableEpisodes: slim.crunchyroll.availableEpisodes }
  });
});

test('splitItems precomputes availableEpisodeCount to match the live count', () => {
  const slim = makeSlimItem();
  const { core } = splitItems([slim]);
  assert.equal(core[0].availableEpisodeCount, availableEpisodeCount(slim.availableEpisodes));
  assert.equal(core[0].availableEpisodeCount, 2);
});

test('splitItems backfills latestVideoUrl from the newest episode only when missing', () => {
  const withUrl = splitItems([makeSlimItem()]).core[0];
  assert.equal(withUrl.latestVideoUrl, 'https://www.youtube.com/watch?v=latest');
  const backfilled = splitItems([makeSlimItem({ latestVideoUrl: undefined })]).core[0];
  assert.equal(backfilled.latestVideoUrl, 'https://www.youtube.com/watch?v=v2');
});

test('splitItems omits detail entries for items with nothing detail-worthy', () => {
  const bare = makeSlimItem({ summary: undefined, availableEpisodes: [], crunchyroll: undefined });
  const { core, details } = splitItems([bare]);
  assert.deepEqual(details, {});
  assert.equal(core[0].availableEpisodeCount, 0);
  assert.deepEqual(splitItems([]), { core: [], details: {} });
});
