const test = require('node:test');
const assert = require('node:assert');
const { applyEntryUpdate, applyEntryInsert, blankEntryTemplate, prefillFromJikan, entryHash } = require('./admin-server');
const { createItem } = require('./update-jikan');

function sampleItems() {
  return [
    { id: 'a', titleThai: 'เรื่องแรก', year: 2026 },
    { id: 'b', titleThai: 'เรื่องสอง', year: 2026 },
    { id: 'c', titleThai: 'เรื่องสาม', year: 2026 }
  ];
}

test('replaces the matching entry in place and keeps order', () => {
  const items = sampleItems();
  const next = applyEntryUpdate(items, 'b', { id: 'b', titleThai: 'แก้แล้ว' });
  assert.deepStrictEqual(next.map(i => i.id), ['a', 'b', 'c']);
  assert.strictEqual(next[1].titleThai, 'แก้แล้ว');
  assert.strictEqual(next[1].year, undefined, 'full replacement drops keys not sent back');
  assert.strictEqual(items[1].titleThai, 'เรื่องสอง', 'input array is not mutated');
});

test('allows renaming id when the new id is free', () => {
  const next = applyEntryUpdate(sampleItems(), 'b', { id: 'b2', titleThai: 'เรื่องสอง' });
  assert.deepStrictEqual(next.map(i => i.id), ['a', 'b2', 'c']);
});

test('rejects renaming id onto an existing entry', () => {
  assert.throws(
    () => applyEntryUpdate(sampleItems(), 'b', { id: 'a', titleThai: 'ชน' }),
    error => error.status === 409
  );
});

test('rejects unknown target id', () => {
  assert.throws(
    () => applyEntryUpdate(sampleItems(), 'nope', { id: 'nope' }),
    error => error.status === 404
  );
});

test('rejects non-object and id-less entries', () => {
  for (const bad of [null, 'text', [1], { titleThai: 'ไม่มี id' }, { id: '  ' }]) {
    assert.throws(() => applyEntryUpdate(sampleItems(), 'a', bad), error => error.status === 400);
  }
});

test('inserts a new entry at the end without mutating the input', () => {
  const items = sampleItems();
  const next = applyEntryInsert(items, { id: 'd', titleThai: 'เรื่องสี่' });
  assert.deepStrictEqual(next.map(i => i.id), ['a', 'b', 'c', 'd']);
  assert.strictEqual(items.length, 3, 'input array is not mutated');
});

test('rejects inserting a duplicate id', () => {
  assert.throws(
    () => applyEntryInsert(sampleItems(), { id: 'b', titleThai: 'ซ้ำ' }),
    error => error.status === 409
  );
});

test('rejects inserting non-object and id-less entries', () => {
  for (const bad of [null, 'text', [1], { titleThai: 'ไม่มี id' }, { id: '  ' }]) {
    assert.throws(() => applyEntryInsert(sampleItems(), bad), error => error.status === 400);
  }
});

function sampleJikanAnime() {
  return {
    mal_id: 999, url: 'https://myanimelist.net/anime/999/Test',
    title: 'Tesuto no Anime', title_english: 'Test Anime',
    titles: [{ title: 'Tesuto no Anime' }, { title: 'Test Anime' }, { title: 'テストのアニメ' }],
    type: 'TV', status: 'Currently Airing', rating: 'PG-13', score: 7.5,
    season: 'summer', year: 2026, episodes: 12,
    aired: { from: '2026-07-01T00:00:00+00:00' },
    broadcast: { day: 'Wednesdays', time: '23:00' },
    studios: [{ name: 'Studio A' }], source: 'Manga',
    genres: [{ name: 'Action' }], themes: [], demographics: [],
    synopsis: 'A test synopsis.',
    images: { webp: { large_image_url: 'https://cdn.example/poster.webp' } }
  };
}

test('prefillFromJikan builds a pipeline-shaped entry', () => {
  const entry = prefillFromJikan(sampleItems(), sampleJikanAnime());
  assert.strictEqual(entry.malId, 999);
  assert.strictEqual(entry.titleThai, 'Test Anime');
  assert.strictEqual(entry.titleOriginal, 'Tesuto no Anime');
  assert.strictEqual(entry.season, 'summer');
  assert.strictEqual(entry.year, 2026);
  assert.strictEqual(entry.episodes, '12');
  assert.strictEqual(entry.status, 'upcoming');
  assert.strictEqual(entry.confidence, 'imported_from_jikan');
  assert.deepStrictEqual(entry.availableEpisodes, []);
  assert.ok(entry.id && entry.id !== 'a', 'generates a fresh slug id');
});

test('prefillFromJikan derives season/year from aired date when missing', () => {
  const anime = { ...sampleJikanAnime(), season: null, year: null, aired: { from: '2025-11-15T00:00:00+00:00' } };
  const entry = prefillFromJikan(sampleItems(), anime);
  assert.strictEqual(entry.season, 'fall');
  assert.strictEqual(entry.year, 2025);
});

test('prefillFromJikan rejects an anime already in the catalog', () => {
  const items = [...sampleItems(), { id: 'dup', titleThai: 'มีแล้ว', malId: 999 }];
  assert.throws(() => prefillFromJikan(items, sampleJikanAnime()), error => error.status === 409);
});

test('prefillFromJikan rejects an anime hand-added earlier without a malId (title match)', () => {
  const items = [...sampleItems(), { id: 'hand-added', titleThai: 'เรื่องทดสอบ', titleOriginal: 'Tesuto no Anime', altTitle: '', confidence: '' }];
  assert.throws(() => prefillFromJikan(items, sampleJikanAnime()), error => error.status === 409);
});

test('prefillFromJikan reads the aired date in UTC, not server-local time', () => {
  // Midnight UTC on New Year's Day: local-time getters would flip this to
  // fall of the previous year on any machine west of UTC.
  const anime = { ...sampleJikanAnime(), mal_id: 1000, title: 'Utc Test Anime', title_english: '', titles: [], season: null, year: null, aired: { from: '2026-01-01T00:00:00+00:00' } };
  const entry = prefillFromJikan(sampleItems(), anime);
  assert.strictEqual(entry.season, 'winter');
  assert.strictEqual(entry.year, 2026);
});

test('rejects inserting a malId already used by another entry', () => {
  const items = [...sampleItems(), { id: 'owner', titleThai: 'เจ้าของ', malId: 500 }];
  assert.throws(
    () => applyEntryInsert(items, { id: 'new-entry', titleThai: 'ซ้ำ malId', malId: 500 }),
    error => error.status === 409
  );
});

test('rejects updating to a malId used elsewhere, but allows keeping your own', () => {
  const items = [
    { id: 'a', titleThai: 'หนึ่ง', malId: 1 },
    { id: 'b', titleThai: 'สอง', malId: 2 }
  ];
  assert.throws(
    () => applyEntryUpdate(items, 'a', { id: 'a', titleThai: 'หนึ่ง', malId: 2 }),
    error => error.status === 409
  );
  const next = applyEntryUpdate(items, 'a', { id: 'a', titleThai: 'แก้แล้ว', malId: 1 });
  assert.strictEqual(next[0].titleThai, 'แก้แล้ว');
});

test('blankEntryTemplate stays in shape-lockstep with createItem', () => {
  const pipeline = createItem(sampleJikanAnime(), 'summer', 2026, new Set());
  const templateKeys = new Set(Object.keys(blankEntryTemplate()));
  const pipelineKeys = new Set(Object.keys(pipeline));
  // malId is the single intentional difference: a manual add has no MAL link
  // yet, and the key must be absent (not null) so tools that index by malId
  // never see Number(null) === 0.
  assert.ok(!templateKeys.has('malId'), 'template must not carry a malId key');
  pipelineKeys.delete('malId');
  assert.deepStrictEqual([...templateKeys].sort(), [...pipelineKeys].sort());
});

test('rejects a stale baseHash but accepts a current one', () => {
  const items = sampleItems();
  const current = entryHash(items[1]);
  const next = applyEntryUpdate(items, 'b', { id: 'b', titleThai: 'สดใหม่' }, current);
  assert.strictEqual(next[1].titleThai, 'สดใหม่');
  assert.throws(
    () => applyEntryUpdate(items, 'b', { id: 'b' }, entryHash({ id: 'b', stale: true })),
    error => error.status === 409
  );
});
