const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stampAssets } = require('./stamp-asset-version');

test('stampAssets versions same-origin js/css refs', () => {
  const html = stampAssets('<link rel="stylesheet" href="styles.css" /><script src="app.js" defer></script>', 'abc1234');
  assert.match(html, /href="styles\.css\?v=abc1234"/);
  assert.match(html, /src="app\.js\?v=abc1234"/);
});

test('stampAssets versions nested refs like data/anime.js', () => {
  assert.match(stampAssets('<script src="data/anime.js" defer></script>', 'abc1234'), /src="data\/anime\.js\?v=abc1234"/);
});

test('stampAssets leaves cross-origin, protocol-relative and data: refs alone', () => {
  const html = '<link href="https://fonts.googleapis.com/css2?family=X" /><link href="//cdn.test/x.css" /><link rel="icon" href="data:image/svg+xml,%3Csvg%3E" />';
  assert.equal(stampAssets(html, 'abc1234'), html);
});

test('stampAssets is idempotent — an already-stamped ref is not stamped twice', () => {
  const once = stampAssets('<script src="app.js"></script>', 'abc1234');
  assert.equal(stampAssets(once, 'abc1234'), once);
});

test('stampAssets requires a version', () => {
  assert.throws(() => stampAssets('<script src="app.js"></script>', ''), /version is required/);
});

// The whole point is that the deployed HTML never ships an unversioned local
// asset — guard against a future <script>/<link> being added without one.
test('every local js/css ref in index.html gets stamped', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const stamped = stampAssets(html, 'abc1234');
  const unversioned = [...stamped.matchAll(/\b(?:src|href)="(?!https?:|data:|\/\/|#)([^"]+\.(?:js|css))"/g)];
  assert.deepEqual(unversioned.map(m => m[1]), [], 'local asset refs left unversioned in index.html');
  assert.ok(stamped.includes('src="app.js?v=abc1234"'));
  assert.ok(stamped.includes('src="data/anime.js?v=abc1234"'));
});
