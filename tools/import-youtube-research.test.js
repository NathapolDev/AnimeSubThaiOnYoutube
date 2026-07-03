const test = require('node:test');
const assert = require('node:assert/strict');
const { importResearch, youtubeVideoId } = require('./import-youtube-research');

test('imports researched channel metadata without marking an episode available', () => {
  const anime = [{ id: 'show', malId: 1, channel: 'ยังไม่ประกาศช่องทางไทย', availableEpisodes: [], youtubeAliases: [] }];
  const queue = { schemaVersion: 1, items: [{
    id: 'show', malId: 1, researchStatus: 'official_channel_announced_no_episode',
    officialChannelName: 'Muse Thailand', officialChannelUrl: 'https://www.youtube.com/@MuseThailand',
    youtubeAliases: ['ชื่อไทย'], sourceUrls: ['https://example.com/evidence'], notes: 'announced', confidence: 'probable'
  }] };
  const result = importResearch(anime, queue);
  assert.equal(result.updated, 1);
  assert.equal(anime[0].channel, 'Muse Thailand');
  assert.equal(anime[0].youtubeResearchStatus, 'official_channel_announced_no_episode');
  assert.deepEqual(anime[0].availableEpisodes, []);
  assert.deepEqual(anime[0].youtubeAliases, ['ชื่อไทย']);
});

test('rejects mismatched identity and does not overwrite a confirmed playlist', () => {
  const anime = [{ id: 'show', malId: 1, playlistId: 'confirmed', youtubeAliases: [] }];
  const queue = { schemaVersion: 1, items: [
    { id: 'show', malId: 2, notes: 'wrong record' },
    { id: 'show', malId: 1, playlistUrl: 'https://www.youtube.com/playlist?list=different' }
  ] };
  const result = importResearch(anime, queue);
  assert.equal(result.conflicts.length, 2);
  assert.equal(anime[0].playlistId, 'confirmed');
});

test('merges valid direct episode URLs without duplicates', () => {
  const anime = [{ id: 'show', malId: 1, availableEpisodes: [{ videoId: 'abc', videoUrl: 'https://youtu.be/abc' }] }];
  const queue = { schemaVersion: 1, items: [{ id: 'show', malId: 1, episodeUrls: ['https://youtu.be/abc', 'https://www.youtube.com/watch?v=def'] }] };
  const result = importResearch(anime, queue);
  assert.equal(result.updated, 1);
  assert.deepEqual(anime[0].availableEpisodes.map(item => item.videoId), ['abc', 'def']);
  assert.equal(youtubeVideoId('https://youtu.be/xyz'), 'xyz');
});
