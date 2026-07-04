const test = require('node:test');
const assert = require('node:assert/strict');
const { safeExternalUrl } = require('../safe-url');

test('allows HTTPS links for supported external sites', () => {
  assert.equal(safeExternalUrl('https://www.youtube.com/watch?v=abc'), 'https://www.youtube.com/watch?v=abc');
  assert.equal(safeExternalUrl('https://youtu.be/abc'), 'https://youtu.be/abc');
  assert.equal(safeExternalUrl('https://myanimelist.net/anime/1'), 'https://myanimelist.net/anime/1');
  assert.equal(safeExternalUrl('https://www.crunchyroll.com/watch/GWDU7300N/x'), 'https://www.crunchyroll.com/watch/GWDU7300N/x');
  assert.equal(safeExternalUrl('https://crunchyroll.com/series/G3KHEVDJ7'), 'https://crunchyroll.com/series/G3KHEVDJ7');
});

test('rejects executable, insecure, and lookalike URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://www.youtube.com/watch?v=abc',
    'https://youtube.com.evil.example/watch?v=abc',
    'https://evil.example/?next=youtube.com',
    'http://www.crunchyroll.com/watch/abc/x',
    'https://crunchyroll.com.evil.example/watch/abc/x'
  ]) assert.equal(safeExternalUrl(url), '#');
});

test('uses the requested fallback for invalid values', () => {
  assert.equal(safeExternalUrl('not a URL', ''), '');
});
