const test = require('node:test');
const assert = require('node:assert');
const { applyEntryUpdate, entryHash } = require('./admin-server');

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
