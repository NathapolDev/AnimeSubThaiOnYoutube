'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { availableEpisodeCount, episodeProgress } = require('../progress.js');

const episodes = count => Array.from({ length: count }, (_, index) => ({ number: index + 1 }));

test('uses detected YouTube episode count instead of latest episode number', () => {
  const prog = episodeProgress({ episodes: 19, currentEpisode: 77, availableEpisodes: episodes(15) });
  assert.deepEqual(prog, { show: true, current: 15, total: 19, percent: 79 });
});

test('caps detected YouTube episode count at season total', () => {
  const prog = episodeProgress({ episodes: 19, currentEpisode: 77, availableEpisodes: episodes(25) });
  assert.deepEqual(prog, { show: true, current: 19, total: 19, percent: 100 });
});

test('accepts the season total as a string', () => {
  const prog = episodeProgress({ episodes: '19', availableEpisodes: episodes(15) });
  assert.deepEqual(prog, { show: true, current: 15, total: 19, percent: 79 });
});

test('counts a compilation video by the episode range it contains', () => {
  const availableEpisodes = [{ number: 4, startNumber: 1, endNumber: 4 }];
  assert.equal(availableEpisodeCount(availableEpisodes), 4);
  assert.deepEqual(episodeProgress({ episodes: 12, availableEpisodes }), {
    show: true, current: 4, total: 12, percent: 33
  });
});

test('counts overlapping ranges and individual uploads only once per episode number', () => {
  assert.equal(availableEpisodeCount([
    { number: 3, startNumber: 1, endNumber: 3, videoId: 'range-1-3' },
    { number: 4, startNumber: 1, endNumber: 4, videoId: 'range-1-4' },
    { number: 2, videoId: 'episode-2' }
  ]), 4);
});

test('counts separate unnumbered videos independently', () => {
  assert.equal(availableEpisodeCount([
    { number: null, videoId: 'special-a' },
    { number: null, videoId: 'special-b' }
  ]), 2);
});

test('hides the bar when no YouTube episodes were detected', () => {
  const prog = episodeProgress({ episodes: 12, currentEpisode: 5, availableEpisodes: [] });
  assert.equal(prog.show, false);
  assert.equal(prog.percent, 0);
});

test('hides the bar when the season total is unknown', () => {
  const prog = episodeProgress({ episodes: '?', availableEpisodes: episodes(3) });
  assert.equal(prog.show, false);
  assert.equal(prog.percent, 0);
});

test('hides the bar when availableEpisodes is missing', () => {
  const prog = episodeProgress({ episodes: 12 });
  assert.equal(prog.show, false);
  assert.equal(prog.current, 0);
});
