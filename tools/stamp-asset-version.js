const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// GitHub Pages serves index.html and its assets with the same short max-age, but
// the assets are cached by filename alone — a returning browser pairs the fresh
// HTML with a stale app.js/styles.css and the page renders broken. Stamping each
// local asset ref with a hash of that file's own bytes fixes the pairing while
// keeping unchanged assets on stable URLs across the thrice-daily data deploys,
// so browsers revalidate them to 304s instead of re-downloading everything.
// Only same-origin .js/.css refs are touched: http(s)://, //, data: and #anchors
// are left alone, as are refs that already carry a query string.
const LOCAL_ASSET_REF = /\b(src|href)="(?!https?:|data:|\/\/|#)([^"?#]+\.(?:js|css))"/g;

function stampAssets(html, versionFor) {
  if (typeof versionFor !== 'function') throw new Error('versionFor function is required');
  return html.replace(LOCAL_ASSET_REF, (_match, attr, url) => `${attr}="${url}?v=${encodeURIComponent(versionFor(url))}"`);
}

// A missing referenced file throws so a broken ref fails the deploy instead of
// silently shipping an unversioned or dead URL.
function fileVersionFor(baseDir) {
  return url => {
    let bytes;
    try { bytes = fs.readFileSync(path.resolve(baseDir, url)); }
    catch { throw new Error(`asset not found: ${url}`); }
    return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  };
}

function main() {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error('usage: node tools/stamp-asset-version.js <html-file>');
  const target = path.resolve(file);
  const html = fs.readFileSync(target, 'utf8');
  const stamped = stampAssets(html, fileVersionFor(path.dirname(target)));
  fs.writeFileSync(target, stamped, 'utf8');
  const count = (stamped.match(/\?v=/g) || []).length;
  console.log(`Asset version stamped: ${count} refs -> per-file content hashes`);
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`Asset stamping failed: ${error.message}`); process.exitCode = 1; }
}

module.exports = { stampAssets, fileVersionFor };
