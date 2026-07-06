const test = require('node:test');
const assert = require('node:assert/strict');
const { aliasesForAnime, applyDiscoveries, diceSimilarity, matchVideoToAnime } = require('./discover-youtube');

const REAR = 'กองหลังที่แข็งแรงที่สุดในโลก'; // stored literal-translation Thai title

test('diceSimilarity is 1 for identical strings and 0 for disjoint ones', () => {
  assert.equal(diceSimilarity('กองหลัง', 'กองหลัง'), 1);
  assert.equal(diceSimilarity('abcd', 'wxyz'), 0);
  const partial = diceSimilarity('กองหลังที่แข็งแกร่ง', REAR);
  assert.ok(partial > 0 && partial < 1);
  assert.equal(diceSimilarity('', 'anything'), 0);
});

test('aliasesForAnime folds in anilistTitles and drops empty / short entries', () => {
  const aliases = aliasesForAnime({
    titleThai: '', titleOriginal: '', altTitle: '', youtubeAliases: [],
    anilistTitles: { romaji: 'Sekai Saikyou', english: '', native: '世界最強の後衛', synonyms: ['Novice Seeker', 'x'] }
  });
  assert.ok(aliases.includes('sekai saikyou'));
  assert.ok(aliases.includes('世界最強の後衛'));
  assert.ok(aliases.includes('novice seeker'));
  assert.ok(!aliases.includes('x')); // below the >= 6 char floor
});

test('Tier 1 exact substring still wins and reports matchType "exact"', () => {
  const anime = [{ id: 'a', titleOriginal: 'My Hero Story', youtubeAliases: [] }];
  const result = matchVideoToAnime({ title: 'My Hero Story ตอนที่ 2' }, anime);
  assert.equal(result.match.id, 'a');
  assert.equal(result.matchType, 'exact');
});

test('Tier 2 auto-applies a clear high-confidence fuzzy winner (Thai spelling variant)', () => {
  const anime = [{ id: 'rear', titleThai: REAR, youtubeAliases: [] }];
  // แข็งแกร่ง vs stored แข็งแรง — not a substring, but ~0.88 Dice similarity.
  const result = matchVideoToAnime({ title: 'กองหลังที่แข็งแกร่งที่สุดในโลก ตอนที่ 5' }, anime);
  assert.equal(result.matchType, 'fuzzy');
  assert.equal(result.match.id, 'rear');
  assert.ok(result.score >= 0.72);
});

test('Tier 2 medium-confidence match becomes a review suggestion, not an auto-link', () => {
  const anime = [{ id: 'rear', titleThai: REAR, youtubeAliases: [] }];
  const result = matchVideoToAnime({ title: 'กองหลังที่แข็งแกร่ง ตอนที่ 1' }, anime); // ~0.62
  assert.equal(result.match, null);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].item.id, 'rear');
});

test('a genuine protagonist-name paraphrase matches nothing (fuzzy cannot bridge it)', () => {
  const anime = [{ id: 'rear', titleThai: REAR, youtubeAliases: [] }];
  const result = matchVideoToAnime(
    { title: 'อาริฮิโตะ - ลีดเดอร์ที่สนับสนุนพวกพ้องในฐานะกองหลัง ตอนที่ 1' }, anime
  );
  assert.equal(result.match, null);
  assert.equal(result.suggestions.length, 0);
});

test('an above-threshold near-tie is routed to suggestions rather than auto-applied', () => {
  // The video show name substring-matches neither alias, and both score >= AUTO within
  // FUZZY_MARGIN of each other, so no single winner is safe to auto-link.
  const anime = [
    { id: 'x', titleThai: 'กองหลังที่แข็งแกร่งที่สุดในโลก', youtubeAliases: [] },
    { id: 'y', titleThai: 'กองหลังที่แข็งแกร่งยิ่งที่สุดในโลก', youtubeAliases: [] }
  ];
  const result = matchVideoToAnime({ title: 'กองหลังที่แข็งแกร่งมากที่สุดในโลก ตอนที่ 5' }, anime);
  assert.equal(result.match, null);
  assert.ok(result.suggestions.length >= 2);
});

test('applyDiscoveries auto-links a fuzzy winner and tags fuzzy_title_match', () => {
  const anime = [{ id: 'rear', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleThai: REAR, youtubeAliases: [], availableEpisodes: [] }];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  const candidates = [];
  applyDiscoveries(anime, channel, [
    { videoId: 'v5', title: 'กองหลังที่แข็งแกร่งที่สุดในโลก ตอนที่ 5', publishedAt: '2026-07-05T00:00:00Z' }
  ], candidates, [2026]);
  assert.equal(anime[0].youtubeSourceType, 'channel_uploads');
  assert.equal(anime[0].youtubeMatchConfidence, 'fuzzy_title_match');
  assert.equal(anime[0].currentEpisode, 5);
  assert.equal(candidates.length, 0);
});

test('applyDiscoveries records a medium fuzzy match as a suggestion without touching the item', () => {
  const anime = [{ id: 'rear', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleThai: REAR, youtubeAliases: [], availableEpisodes: [] }];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  const candidates = [];
  applyDiscoveries(anime, channel, [
    { videoId: 'v1', title: 'กองหลังที่แข็งแกร่ง ตอนที่ 1', publishedAt: '2026-07-05T00:00:00Z' }
  ], candidates, [2026]);
  assert.equal(anime[0].youtubeSourceType || '', '');
  assert.equal(anime[0].availableEpisodes.length, 0);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].type, 'fuzzy_suggestion');
  assert.equal(candidates[0].matches[0].id, 'rear');
});
