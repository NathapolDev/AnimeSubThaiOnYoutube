const test = require('node:test');
const assert = require('node:assert/strict');
const { applySnapshot, bangkokParts, rankSeason } = require('./update-ranking-snapshot');

// Bangkok is UTC+7, so a UTC hour of 04:00 keeps the calendar day stable across the conversion.
const bkk = iso => new Date(`${iso}T04:00:00Z`);
const summer = (id, score) => ({ id, titleThai: id, jikanType: 'TV', catalogYear: 2026, season: 'summer', score });

test('bangkokParts resolves the Bangkok calendar day and season', () => {
  assert.deepEqual(bangkokParts(new Date('2026-07-25T18:00:00Z')), { year: 2026, season: 'summer', date: '2026-07-26' });
  assert.deepEqual(bangkokParts(bkk('2026-01-09')), { year: 2026, season: 'winter', date: '2026-01-09' });
});

test('ranking keeps only scored current-season TV and breaks ties on the Thai title', () => {
  const ranked = rankSeason([
    summer('beta', 8.2), summer('alpha', 8.2), summer('unscored', 0),
    { id: 'movie', titleThai: 'movie', jikanType: 'Movie', catalogYear: 2026, season: 'summer', score: 9.5 },
    { id: 'spring', titleThai: 'spring', jikanType: 'TV', catalogYear: 2026, season: 'spring', score: 9.4 },
    { id: 'lastyear', titleThai: 'lastyear', jikanType: 'TV', catalogYear: 2025, season: 'summer', score: 9.3 }
  ], { year: 2026, season: 'summer' });
  assert.deepEqual(ranked.map(item => item.id), ['alpha', 'beta']);
});

test('the first snapshot marks every ranked anime as new', () => {
  const items = [summer('a', 8.9), summer('b', 8.5)];
  const snapshot = applySnapshot(items, null, bkk('2026-07-26'));
  assert.deepEqual(snapshot.ranks, { a: 1, b: 2 });
  assert.equal(snapshot.date, '2026-07-26');
  assert.deepEqual(items.map(item => [item.seasonRank, item.seasonRankPrevious]), [[1, 0], [2, 0]]);
});

test('a same-day rerun refreshes ranks but keeps the comparison baseline fixed', () => {
  const stored = { year: 2026, season: 'summer', date: '2026-07-26', ranks: { a: 1, b: 2 }, previous: { date: '2026-07-25', ranks: { a: 2, b: 1 } } };
  const items = [summer('a', 8.5), summer('b', 8.9)];
  const snapshot = applySnapshot(items, stored, bkk('2026-07-26'));
  assert.deepEqual(snapshot.ranks, { b: 1, a: 2 });
  assert.deepEqual(snapshot.previous, { date: '2026-07-25', ranks: { a: 2, b: 1 } });
  assert.equal(items[0].seasonRankPrevious, 2); // still measured against yesterday, not this morning's run
});

test('crossing into a new Bangkok day promotes the stored ranks to the baseline', () => {
  const stored = { year: 2026, season: 'summer', date: '2026-07-26', ranks: { a: 1, b: 2 }, previous: { date: '2026-07-25', ranks: {} } };
  const items = [summer('a', 8.4), summer('b', 8.9)];
  const snapshot = applySnapshot(items, stored, bkk('2026-07-27'));
  assert.deepEqual(snapshot.previous, { date: '2026-07-26', ranks: { a: 1, b: 2 } });
  assert.deepEqual(items.map(item => [item.seasonRank, item.seasonRankPrevious]), [[2, 1], [1, 2]]);
});

test('a new season starts from an empty baseline', () => {
  const stored = { year: 2026, season: 'spring', date: '2026-06-30', ranks: { a: 4 }, previous: { date: '2026-06-29', ranks: { a: 3 } } };
  const items = [summer('a', 8.4)];
  const snapshot = applySnapshot(items, stored, bkk('2026-07-26'));
  assert.deepEqual(snapshot.previous, { date: '', ranks: {} });
  assert.equal(items[0].seasonRankPrevious, 0);
});

test('anime that fall out of the Top 10 lose their stored rank fields', () => {
  const items = Array.from({ length: 11 }, (_, index) => summer(`anime-${index}`, 9 - index * 0.1));
  const dropped = items[10];
  dropped.seasonRank = 10;
  dropped.seasonRankPrevious = 9;
  applySnapshot(items, null, bkk('2026-07-26'));
  assert.equal(items[9].seasonRank, 10);
  assert.equal('seasonRank' in dropped, false);
  assert.equal('seasonRankPrevious' in dropped, false);
});
