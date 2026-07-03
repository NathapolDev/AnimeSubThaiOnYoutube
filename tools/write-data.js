const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const JS_PATH = path.join(ROOT, 'data', 'anime.js');

// anime.json stays pretty-printed for reviewable diffs; anime.js is the
// browser payload, so it is written minified.
async function writeDataFiles(items) {
  await fs.writeFile(JSON_PATH, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  await fs.writeFile(JS_PATH, `window.ANIME_DATA = ${JSON.stringify(items)};\n`, 'utf8');
}

module.exports = { writeDataFiles };
