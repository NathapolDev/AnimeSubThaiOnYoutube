const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHANNELS_PATH, aliasesForAnime, applyDiscoveries, diceSimilarity, matchVideoToAnime, normalizeTitle, updateDiscoveryStatuses } = require('./discover-youtube');

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

test('aliasesForAnime honors a lower length floor for the scan tool', () => {
  const item = { titleThai: '', titleOriginal: 'Hero', altTitle: '', youtubeAliases: [] };
  assert.ok(!aliasesForAnime(item).includes('hero'));    // default floor 6 excludes it
  assert.ok(aliasesForAnime(item, 4).includes('hero'));  // scan's floor 4 keeps it
});

test('aliasesForAnime tolerates a malformed non-array synonyms value', () => {
  const aliases = aliasesForAnime({
    titleThai: '', titleOriginal: 'Real Title', altTitle: '', youtubeAliases: [],
    anilistTitles: { romaji: '', english: '', native: '', synonyms: 42 }
  });
  assert.deepEqual(aliases, ['real title']); // no throw, bad synonyms ignored
});

test('normalizeTitle keeps Thai tone and vowel marks so distinct titles stay distinct', () => {
  assert.notEqual(normalizeTitle('น้ำ'), normalizeTitle('นา'));
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
  const similarity = candidates[0].matches[0].similarity;
  assert.ok(similarity >= 0.5 && similarity < 0.72); // 0-1 Dice float, distinct from ambiguous_title's integer matchLength
});

test('Tier 1 exact match works from anilistTitles.english and reports the winning alias', () => {
  const anime = [{ id: 'frieren', titleThai: 'คำอธิษฐานในวันที่จากลา', anilistTitles: { english: 'Frieren: Beyond Journey\'s End' } }];
  const result = matchVideoToAnime({ title: 'Frieren: Beyond Journey\'s End - ตอนที่ 3 [ซับไทย]' }, anime);
  assert.equal(result.match.id, 'frieren');
  assert.equal(result.matchType, 'exact');
  assert.equal(result.alias, normalizeTitle('Frieren: Beyond Journey\'s End'));
});

test('Tier 1 exact match works from anilistTitles.romaji', () => {
  const anime = [{ id: 'frieren', titleThai: 'คำอธิษฐานในวันที่จากลา', anilistTitles: { romaji: 'Sousou no Frieren' } }];
  const result = matchVideoToAnime({ title: 'Sousou no Frieren ตอนที่ 12' }, anime);
  assert.equal(result.match.id, 'frieren');
  assert.equal(result.matchType, 'exact');
});

test('applyDiscoveries records full diagnostics for an exact match', () => {
  const anime = [{ id: 'a', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleOriginal: 'My Hero Story', youtubeAliases: [], availableEpisodes: [] }];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  applyDiscoveries(anime, channel, [
    { videoId: 'v2', title: 'My Hero Story ตอนที่ 2 [ซับไทย]', publishedAt: '2026-07-05T00:00:00Z' }
  ], [], [2026]);
  assert.equal(anime[0].youtubeMatchConfidence, 'strong_unique_title_match');
  assert.equal(anime[0].youtubeMatchType, 'exact');
  assert.equal(anime[0].youtubeMatchedAlias, 'my hero story');
  assert.equal(anime[0].youtubeMatchedVideoTitle, 'My Hero Story ตอนที่ 2 [ซับไทย]');
  assert.equal(anime[0].youtubeMatchedScore, 'my hero story'.length); // exact score = alias length
  assert.ok(!Number.isNaN(Date.parse(anime[0].youtubeLastMatchedAt)));
  assert.equal(anime[0].youtubeDiscoveryStatus, 'matched');
});

test('applyDiscoveries records the Dice similarity as the score for a fuzzy auto-link', () => {
  const anime = [{ id: 'rear', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleThai: REAR, youtubeAliases: [], availableEpisodes: [] }];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  applyDiscoveries(anime, channel, [
    { videoId: 'v5', title: 'กองหลังที่แข็งแกร่งที่สุดในโลก ตอนที่ 5', publishedAt: '2026-07-05T00:00:00Z' }
  ], [], [2026]);
  assert.equal(anime[0].youtubeMatchType, 'fuzzy');
  assert.equal(anime[0].youtubeMatchedAlias, normalizeTitle(REAR));
  assert.ok(anime[0].youtubeMatchedScore >= 0.72 && anime[0].youtubeMatchedScore < 1);
});

test('applyDiscoveries skips an item with an existing playlistId even when its title matches', () => {
  const anime = [{
    id: 'playlist', jikanType: 'TV', playlistId: 'PLfixed', catalogYear: 2026, titleOriginal: 'Playlist Show',
    availableEpisodes: [{ number: 1, videoId: 'orig', publishedAt: '2026-06-01T00:00:00Z' }]
  }];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  const candidates = [];
  applyDiscoveries(anime, channel, [
    { videoId: 'c2', title: 'Playlist Show ตอนที่ 2', publishedAt: '2026-07-05T00:00:00Z' }
  ], candidates, [2026]);
  assert.deepEqual(anime[0].availableEpisodes.map(episode => episode.videoId), ['orig']);
  assert.equal(anime[0].youtubeSourceType || '', ''); // playlist source untouched
  assert.equal(candidates.length, 0);
});

test('fuzzy suggestion candidates carry full review context in a single consolidated entry', () => {
  const anime = [
    { id: 'x', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleThai: 'กองหลังที่แข็งแกร่งที่สุดในโลก', titleOriginal: 'Strongest Rearguard X', availableEpisodes: [] },
    { id: 'y', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleThai: 'กองหลังที่แข็งแกร่งยิ่งที่สุดในโลก', titleOriginal: 'Strongest Rearguard Y', availableEpisodes: [] }
  ];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  const candidates = [];
  applyDiscoveries(anime, channel, [
    { videoId: 'tie', title: 'กองหลังที่แข็งแกร่งมากที่สุดในโลก ตอนที่ 5', publishedAt: '2026-07-05T00:00:00Z' }
  ], candidates, [2026]);
  assert.equal(candidates.length, 1); // near-tie -> one entry listing every plausible match
  const entry = candidates[0];
  assert.equal(entry.type, 'fuzzy_suggestion');
  assert.equal(entry.episodeNumber, 5);
  assert.equal(entry.publishedAt, '2026-07-05T00:00:00Z');
  assert.equal(entry.extractedShowName, normalizeTitle('กองหลังที่แข็งแกร่งมากที่สุดในโลก'));
  assert.ok(entry.matches.length >= 2);
  for (const match of entry.matches) {
    assert.ok(['x', 'y'].includes(match.id));
    assert.ok(match.titleThai && match.titleOriginal && match.alias);
    assert.ok(match.similarity > 0 && match.similarity < 1);
  }
  assert.equal(anime[0].availableEpisodes.length + anime[1].availableEpisodes.length, 0); // items untouched
});

test('ambiguous exact-tie candidates list every matched anime with its alias and titles', () => {
  const anime = [
    { id: 'x', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleOriginal: 'Shared Name', titleThai: 'ชื่อร่วม เอ็กซ์', availableEpisodes: [] },
    { id: 'y', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleOriginal: 'Shared Name', titleThai: 'ชื่อร่วม วาย', availableEpisodes: [] }
  ];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  const candidates = [];
  applyDiscoveries(anime, channel, [
    { videoId: 'amb', title: 'Shared Name EP 7', publishedAt: '2026-07-05T00:00:00Z' }
  ], candidates, [2026]);
  assert.equal(candidates.length, 1);
  const entry = candidates[0];
  assert.equal(entry.type, 'ambiguous_title');
  assert.equal(entry.episodeNumber, 7);
  assert.equal(entry.publishedAt, '2026-07-05T00:00:00Z');
  assert.deepEqual(entry.matches.map(match => match.id).sort(), ['x', 'y']);
  for (const match of entry.matches) {
    assert.equal(match.alias, 'shared name');
    assert.ok(match.titleThai);
  }
});

test('a fuzzy-only incremental run never downgrades a stored strong match', () => {
  const anime = [{
    id: 'rear', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleThai: REAR, youtubeAliases: [],
    youtubeSourceType: 'channel_uploads', youtubeChannelId: 'muse',
    youtubeMatchConfidence: 'strong_unique_title_match',
    availableEpisodes: [{ number: 4, videoId: 'v4', publishedAt: '2026-06-28T00:00:00Z' }]
  }];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  applyDiscoveries(anime, channel, [
    { videoId: 'v5', title: 'กองหลังที่แข็งแกร่งที่สุดในโลก ตอนที่ 5', publishedAt: '2026-07-05T00:00:00Z' } // fuzzy-only spelling variant
  ], [], [2026]);
  assert.equal(anime[0].currentEpisode, 5); // episode still merged in
  assert.equal(anime[0].youtubeMatchConfidence, 'strong_unique_title_match'); // provenance not downgraded
});

test('a fuzzy-only incremental run keeps the stored exact-match diagnostics intact', () => {
  const anime = [{
    id: 'rear', jikanType: 'TV', playlistId: '', catalogYear: 2026, titleThai: REAR, youtubeAliases: [],
    youtubeSourceType: 'channel_uploads', youtubeChannelId: 'muse',
    youtubeMatchConfidence: 'strong_unique_title_match', youtubeMatchType: 'exact',
    youtubeMatchedAlias: normalizeTitle(REAR), youtubeMatchedVideoTitle: `${REAR} ตอนที่ 4`,
    youtubeMatchedScore: normalizeTitle(REAR).length, youtubeLastMatchedAt: '2026-06-28T00:00:00.000Z',
    availableEpisodes: [{ number: 4, videoId: 'v4', publishedAt: '2026-06-28T00:00:00Z' }]
  }];
  const channel = { channelId: 'muse', channelTitle: 'Muse Thailand', label: 'Muse Thailand' };
  applyDiscoveries(anime, channel, [
    { videoId: 'v5', title: 'กองหลังที่แข็งแกร่งที่สุดในโลก ตอนที่ 5', publishedAt: '2026-07-05T00:00:00Z' } // fuzzy-only spelling variant
  ], [], [2026]);
  assert.equal(anime[0].youtubeMatchType, 'exact');
  assert.equal(anime[0].youtubeMatchedAlias, normalizeTitle(REAR));
  assert.equal(anime[0].youtubeMatchedVideoTitle, `${REAR} ตอนที่ 4`);
  assert.equal(anime[0].youtubeMatchedScore, normalizeTitle(REAR).length);
  assert.ok(anime[0].youtubeLastMatchedAt > '2026-06-28T00:00:00.000Z'); // freshness stamp still advances
});

test('updateDiscoveryStatuses assigns matched, needs_review, not_found, and skipped_has_playlist', () => {
  const anime = [
    { id: 'playlisted', jikanType: 'TV', playlistId: 'PL1', catalogYear: 2026 },
    { id: 'linked', jikanType: 'TV', playlistId: '', catalogYear: 2026, youtubeSourceType: 'channel_uploads', availableEpisodes: [{ videoId: 'v' }] },
    { id: 'pending', jikanType: 'TV', playlistId: '', catalogYear: 2026 },
    { id: 'missing', jikanType: 'TV', playlistId: '', catalogYear: 2026 },
    { id: 'archived', jikanType: 'TV', playlistId: '', catalogYear: 2025 }, // outside window
    { id: 'movie', jikanType: 'Movie', playlistId: '', catalogYear: 2026 } // not TV
  ];
  updateDiscoveryStatuses(anime, { reviewIds: new Set(['pending']), years: [2026] });
  assert.equal(anime[0].youtubeDiscoveryStatus, 'skipped_has_playlist');
  assert.equal(anime[1].youtubeDiscoveryStatus, 'matched');
  assert.equal(anime[2].youtubeDiscoveryStatus, 'needs_review');
  assert.equal(anime[3].youtubeDiscoveryStatus, 'not_found');
  assert.equal(anime[4].youtubeDiscoveryStatus, undefined);
  assert.equal(anime[5].youtubeDiscoveryStatus, undefined);
});

test('updateDiscoveryStatuses keeps needs_review sticky across evidence-free incremental runs', () => {
  const anime = [{ id: 'pending', jikanType: 'TV', playlistId: '', catalogYear: 2026, youtubeDiscoveryStatus: 'needs_review' }];
  updateDiscoveryStatuses(anime, { reviewIds: new Set(), years: [2026] }); // no new candidates this run
  assert.equal(anime[0].youtubeDiscoveryStatus, 'needs_review');
});

test('updateDiscoveryStatuses marks items bound to a failed channel as error, not not_found', () => {
  const anime = [{ id: 'bound', jikanType: 'TV', playlistId: '', catalogYear: 2026, youtubeChannelId: 'down', availableEpisodes: [] }];
  updateDiscoveryStatuses(anime, { erroredChannelIds: new Set(['down']), years: [2026] });
  assert.equal(anime[0].youtubeDiscoveryStatus, 'error');
});

test('the official channel whitelist lives in data/youtube-channels.json, not in code', () => {
  assert.ok(CHANNELS_PATH.endsWith(path.join('data', 'youtube-channels.json')));
  const channels = JSON.parse(fs.readFileSync(CHANNELS_PATH, 'utf8'));
  assert.ok(Array.isArray(channels) && channels.length > 0);
  for (const channel of channels) {
    assert.ok(channel.handle.startsWith('@'));
    assert.ok(channel.label);
  }
});
