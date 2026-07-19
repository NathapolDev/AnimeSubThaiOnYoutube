const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { stampAssets, fileVersionFor } = require('./stamp-asset-version');

const constantVersion = () => 'abc1234';

test('stampAssets versions same-origin js/css refs', () => {
  const html = stampAssets('<link rel="stylesheet" href="styles.css" /><script src="app.js" defer></script>', constantVersion);
  assert.match(html, /href="styles\.css\?v=abc1234"/);
  assert.match(html, /src="app\.js\?v=abc1234"/);
});

test('stampAssets versions nested refs like data/anime.js', () => {
  assert.match(stampAssets('<script src="data/anime.js" defer></script>', constantVersion), /src="data\/anime\.js\?v=abc1234"/);
});

test('stampAssets versions each ref with its own hash', () => {
  const versions = { 'app.js': 'aaaa111111', 'styles.css': 'bbbb222222' };
  const html = stampAssets('<link href="styles.css" /><script src="app.js"></script>', url => versions[url]);
  assert.match(html, /href="styles\.css\?v=bbbb222222"/);
  assert.match(html, /src="app\.js\?v=aaaa111111"/);
});

test('stampAssets leaves cross-origin, protocol-relative and data: refs alone', () => {
  const html = '<link href="https://fonts.googleapis.com/css2?family=X" /><link href="//cdn.test/x.css" /><link rel="icon" href="data:image/svg+xml,%3Csvg%3E" />';
  assert.equal(stampAssets(html, constantVersion), html);
});

test('stampAssets is idempotent — an already-stamped ref is not stamped twice', () => {
  const once = stampAssets('<script src="app.js"></script>', constantVersion);
  assert.equal(stampAssets(once, constantVersion), once);
});

test('stampAssets requires a versionFor function', () => {
  assert.throws(() => stampAssets('<script src="app.js"></script>', 'abc1234'), /versionFor function is required/);
});

test('fileVersionFor hashes the referenced file bytes and throws on a missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-test-'));
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1);\n');
  const versionFor = fileVersionFor(dir);
  const expected = crypto.createHash('sha256').update('console.log(1);\n').digest('hex').slice(0, 10);
  assert.equal(versionFor('app.js'), expected);
  assert.throws(() => versionFor('missing.js'), /asset not found: missing\.js/);
});

test('CLI stamps refs with per-file hashes and fails on a missing referenced file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-cli-'));
  fs.writeFileSync(path.join(dir, 'app.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'styles.css'), 'body { margin: 0 }\n');
  const htmlPath = path.join(dir, 'index.html');
  fs.writeFileSync(htmlPath, '<link href="styles.css" /><script src="app.js"></script>');
  const cli = path.join(__dirname, 'stamp-asset-version.js');
  execFileSync(process.execPath, [cli, htmlPath]);
  const stamped = fs.readFileSync(htmlPath, 'utf8');
  const hashOf = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex').slice(0, 10);
  assert.ok(stamped.includes(`href="styles.css?v=${hashOf('styles.css')}"`));
  assert.ok(stamped.includes(`src="app.js?v=${hashOf('app.js')}"`));
  fs.writeFileSync(htmlPath, '<script src="missing.js"></script>');
  assert.throws(
    () => execFileSync(process.execPath, [cli, htmlPath], { stdio: 'pipe' }),
    error => error.status !== 0 && String(error.stderr).includes('asset not found: missing.js')
  );
});

// The whole point is that the deployed HTML never ships an unversioned local
// asset — guard against a future <script>/<link> being added without one.
test('every local js/css ref in index.html gets stamped', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const stamped = stampAssets(html, constantVersion);
  const unversioned = [...stamped.matchAll(/\b(?:src|href)="(?!https?:|data:|\/\/|#)([^"]+\.(?:js|css))"/g)];
  assert.deepEqual(unversioned.map(m => m[1]), [], 'local asset refs left unversioned in index.html');
  assert.ok(stamped.includes('src="app.js?v=abc1234"'));
  assert.ok(stamped.includes('src="data/anime.js?v=abc1234"'));
});
