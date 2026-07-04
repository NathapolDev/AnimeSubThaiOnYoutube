'use strict';

// Data-integrity guards for data/anime.json. These catch the class of corruption
// where an entry's malId points at a DIFFERENT anime, which makes update-jikan.js
// stamp the wrong poster/studio/source onto it (see docs/bugfix-log.md).
const assert = require('node:assert/strict');
const test = require('node:test');
const items = require('../data/anime.json');

const norm = value => (value || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = value => new Set(norm(value).split(' ').filter(word => word.length >= 3));

function parseMalUrl(url) {
  const match = /myanimelist\.net\/anime\/(\d+)\/([^/?#]*)/.exec(url || '');
  return match ? { id: Number(match[1]), slug: match[2].replace(/_/g, ' ') } : null;
}

test('malUrl id matches malId when both are present', () => {
  for (const item of items) {
    const parsed = parseMalUrl(item.malUrl);
    if (!parsed || !item.malId) continue;
    assert.equal(parsed.id, item.malId,
      `${item.id}: malUrl id ${parsed.id} !== malId ${item.malId}`);
  }
});

test('malUrl slug shares a token with the entry title (malId points at the right anime)', () => {
  for (const item of items) {
    const parsed = parseMalUrl(item.malUrl);
    if (!parsed) continue;
    const slugTokens = tokens(parsed.slug);
    const titleTokens = new Set([...tokens(item.titleOriginal), ...tokens(item.altTitle)]);
    if (slugTokens.size === 0 || titleTokens.size === 0) continue;
    const overlap = [...slugTokens].some(token => titleTokens.has(token));
    assert.ok(overlap,
      `${item.id}: malUrl slug "${parsed.slug}" shares no token with title "${item.titleOriginal}" / "${item.altTitle}" — malId ${item.malId} likely belongs to a different anime`);
  }
});

test('no two entries share the same malId', () => {
  const seen = new Map();
  for (const item of items) {
    if (!item.malId) continue;
    assert.ok(!seen.has(item.malId),
      `duplicate malId ${item.malId}: "${seen.get(item.malId)}" and "${item.id}"`);
    seen.set(item.malId, item.id);
  }
});

test('every entry id is unique', () => {
  const seen = new Set();
  for (const item of items) {
    assert.ok(!seen.has(item.id), `duplicate id: ${item.id}`);
    seen.add(item.id);
  }
});
