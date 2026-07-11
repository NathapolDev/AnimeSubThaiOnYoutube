const fs = require('node:fs/promises');
const path = require('node:path');

// GitHub Pages serves index.html and its assets with the same short max-age, but
// the assets are cached by filename alone — a returning browser pairs the fresh
// HTML with a stale app.js/styles.css and the page renders broken. Stamping the
// deployed commit onto every local asset ref makes each deploy a new URL.
// Only same-origin .js/.css refs are touched: http(s)://, //, data: and #anchors
// are left alone, as are refs that already carry a query string.
const LOCAL_ASSET_REF = /\b(src|href)="(?!https?:|data:|\/\/|#)([^"?#]+\.(?:js|css))"/g;

function stampAssets(html, version) {
  if (!version) throw new Error('version is required');
  return html.replace(LOCAL_ASSET_REF, (_match, attr, url) => `${attr}="${url}?v=${encodeURIComponent(version)}"`);
}

async function main() {
  const [file, version] = process.argv.slice(2);
  if (!file || !version) throw new Error('usage: node tools/stamp-asset-version.js <html-file> <version>');
  const target = path.resolve(file);
  const stamped = stampAssets(await fs.readFile(target, 'utf8'), version);
  await fs.writeFile(target, stamped, 'utf8');
  const count = (stamped.match(/\?v=/g) || []).length;
  console.log(`Asset version stamped: ${count} refs -> ?v=${version}`);
}

if (require.main === module) main().catch(error => { console.error(`Asset stamping failed: ${error.message}`); process.exitCode = 1; });

module.exports = { stampAssets };
