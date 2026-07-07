// Local-only admin editor server for data/anime.json.
//
//   node tools/admin-server.js          # then open http://127.0.0.1:4321
//
// Serves the editor UI from admin/ and exposes a tiny API to read the
// catalog and save one entry at a time. Saves go through write-data.js so
// data/anime.json and data/anime.js stay in sync, same as every other tool.
//
// This never reaches GitHub Pages: deploy-pages.yml assembles _site/ from an
// explicit file list that does not include admin/ or this server.
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeDataFiles } = require('./write-data');
const { bangkokYear, createItem, requestJson } = require('./update-jikan');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const ADMIN_DIR = path.join(ROOT, 'admin');
const HOST = '127.0.0.1';
const PORT = Number(process.env.ADMIN_PORT || 4321);
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/admin.css': { file: 'admin.css', type: 'text/css; charset=utf-8' },
  '/admin.js': { file: 'admin.js', type: 'text/javascript; charset=utf-8' }
};

// Fingerprint of one entry as stored on disk; the UI sends back the hash it
// loaded so a save can detect that a pipeline run rewrote the entry meanwhile.
function entryHash(entry) {
  return crypto.createHash('sha1').update(JSON.stringify(entry)).digest('hex');
}

class UpdateError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function assertEntryShape(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new UpdateError(400, 'entry must be a JSON object');
  }
  if (typeof entry.id !== 'string' || !entry.id.trim()) {
    throw new UpdateError(400, 'entry.id must be a non-empty string');
  }
}

// Replace the entry with the given id by `entry` (full replacement, so the UI
// can also drop keys via its raw-JSON mode). Returns a new array; never
// mutates `items`. Throws UpdateError with an HTTP status on bad input.
function applyEntryUpdate(items, id, entry, baseHash) {
  assertEntryShape(entry);
  const index = items.findIndex(item => item.id === id);
  if (index === -1) throw new UpdateError(404, `no anime with id "${id}"`);
  if (entry.id !== id && items.some(item => item.id === entry.id)) {
    throw new UpdateError(409, `id "${entry.id}" is already used by another entry`);
  }
  if (baseHash && baseHash !== entryHash(items[index])) {
    throw new UpdateError(409, 'entry changed on disk since it was loaded (a pipeline run may have updated it) — reload before saving');
  }
  const next = items.slice();
  next[index] = entry;
  return next;
}

// Build a prefilled new entry from a Jikan anime object, using the same
// createItem mapping update-jikan.js uses so a manual add looks exactly like a
// pipeline import. Throws 409 when the anime is already in the catalog.
function prefillFromJikan(items, anime) {
  const existing = items.find(item => item.malId === anime.mal_id);
  if (existing) {
    throw new UpdateError(409, `malId ${anime.mal_id} already exists as "${existing.titleThai}" (id: ${existing.id})`);
  }
  const premiereMonth = anime.aired?.from ? new Date(anime.aired.from).getMonth() + 1 : null;
  const season = anime.season
    || (premiereMonth ? ['winter', 'spring', 'summer', 'fall'][Math.floor((premiereMonth - 1) / 3)] : 'winter');
  const year = anime.year || (anime.aired?.from ? new Date(anime.aired.from).getFullYear() : bangkokYear());
  return createItem(anime, season, year, new Set(items.map(item => item.id)));
}

// Append a brand-new entry (manual add for anime the pipeline hasn't imported).
// Returns a new array; never mutates `items`.
function applyEntryInsert(items, entry) {
  assertEntryShape(entry);
  if (items.some(item => item.id === entry.id)) {
    throw new UpdateError(409, `id "${entry.id}" is already used by another entry`);
  }
  return [...items, entry];
}

async function readItems() {
  return JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new UpdateError(413, 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch (error) {
    if (error instanceof UpdateError) throw error;
    throw new UpdateError(400, `invalid JSON body: ${error.message}`);
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/anime') {
    const items = await readItems();
    const hashes = {};
    for (const item of items) hashes[item.id] = entryHash(item);
    sendJson(res, 200, { items, hashes });
    return;
  }
  const jikanMatch = pathname.match(/^\/api\/jikan\/(\d+)$/);
  if (req.method === 'GET' && jikanMatch) {
    const malId = Number(jikanMatch[1]);
    const items = await readItems();
    const existing = items.find(item => item.malId === malId);
    if (existing) {
      throw new UpdateError(409, `malId ${malId} already exists as "${existing.titleThai}" (id: ${existing.id})`);
    }
    let body;
    try {
      body = await requestJson(`https://api.jikan.moe/v4/anime/${malId}`);
    } catch (error) {
      if (/HTTP 404/.test(error.message)) throw new UpdateError(404, `Jikan has no anime with malId ${malId}`);
      throw new UpdateError(502, `Jikan request failed: ${error.message}`);
    }
    sendJson(res, 200, { entry: prefillFromJikan(items, body.data) });
    return;
  }
  if (req.method === 'POST' && pathname === '/api/anime') {
    const payload = await readJsonBody(req);
    const items = await readItems();
    const next = applyEntryInsert(items, payload.entry);
    await writeDataFiles(next);
    sendJson(res, 200, { ok: true, hash: entryHash(payload.entry) });
    return;
  }
  const entryMatch = pathname.match(/^\/api\/anime\/([^/]+)$/);
  if (req.method === 'PUT' && entryMatch) {
    const id = decodeURIComponent(entryMatch[1]);
    const payload = await readJsonBody(req);
    const items = await readItems();
    const next = applyEntryUpdate(items, id, payload.entry, payload.baseHash);
    await writeDataFiles(next);
    const saved = next.find(item => item.id === payload.entry.id);
    sendJson(res, 200, { ok: true, hash: entryHash(saved) });
    return;
  }
  throw new UpdateError(404, 'unknown API route');
}

async function handleStatic(res, pathname) {
  const mapping = STATIC_FILES[pathname];
  if (!mapping) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  const content = await fs.readFile(path.join(ADMIN_DIR, mapping.file));
  res.writeHead(200, { 'Content-Type': mapping.type });
  res.end(content);
}

function createServer() {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, `http://${HOST}`).pathname;
    try {
      if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
      else await handleStatic(res, pathname);
    } catch (error) {
      const status = error instanceof UpdateError ? error.status : 500;
      if (status === 500) console.error(error);
      sendJson(res, status, { error: error.message });
    }
  });
}

function main() {
  createServer().listen(PORT, HOST, () => {
    console.log(`Anime data editor running at http://${HOST}:${PORT}`);
    console.log('Local admin tool only — not part of the deployed site. Ctrl+C to stop.');
  });
}

if (require.main === module) main();

module.exports = { applyEntryUpdate, applyEntryInsert, prefillFromJikan, entryHash, createServer };
