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
const { bangkokMonth, bangkokYear, createItem, findExisting, requestJson, seasonFromMonth } = require('./update-jikan');

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

// The pipeline dedupes by malId (findExisting in update-jikan.js), so two
// entries sharing one would leave the second forever unenriched.
function assertUniqueMalId(items, entry, excludeId) {
  if (!Number.isFinite(entry.malId)) return;
  const other = items.find(item => item.id !== excludeId && item.malId === entry.malId);
  if (other) {
    throw new UpdateError(409, `malId ${entry.malId} is already used by "${other.titleThai}" (id: ${other.id})`);
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
  assertUniqueMalId(items, entry, id);
  const next = items.slice();
  next[index] = entry;
  return next;
}

// Build a prefilled new entry from a Jikan anime object, using the same
// createItem mapping update-jikan.js uses so a manual add looks exactly like a
// pipeline import. Duplicate detection also mirrors the pipeline: findExisting
// matches by malId first, then by normalized title for malId-less entries, so
// prefilling an anime that was hand-added earlier is rejected instead of
// creating a second entry the next Jikan sync would have merged.
function prefillFromJikan(items, anime) {
  const existing = findExisting(items, anime);
  if (existing) {
    throw new UpdateError(409, `already in the catalog as "${existing.titleThai}" (id: ${existing.id})`);
  }
  // aired.from is an ISO instant; UTC getters recover its calendar date
  // regardless of the machine's timezone (matching the repo's convention of
  // never trusting server-local time).
  const premiere = anime.aired?.from ? new Date(anime.aired.from) : null;
  const season = anime.season
    || (premiere ? seasonFromMonth(premiere.getUTCMonth() + 1) : seasonFromMonth(bangkokMonth()));
  const year = anime.year || (premiere ? premiere.getUTCFullYear() : bangkokYear());
  return createItem(anime, season, year, new Set(items.map(item => item.id)));
}

// Blank draft for a fully manual add (no MAL prefill). Kept next to the API
// so it can be tested against createItem's shape — the admin-server tests
// assert the key sets stay in sync. malId is deliberately absent (not null):
// downstream tools treat "no MAL link" as a missing key, and null would
// collide as Number(null) === 0 in import-youtube-research's malId index.
function blankEntryTemplate(now = new Date()) {
  const year = bangkokYear(now);
  return {
    id: '',
    titleThai: '', titleOriginal: '', altTitle: '',
    studio: '', source: '', episodes: '?', premiere: '',
    airTimeThai: 'รอประกาศเวลาไทย',
    channel: 'ยังไม่ประกาศช่องทางไทย', platform: 'ยังไม่ประกาศ',
    status: 'upcoming', confidence: '', link: '',
    genres: [], summary: '', note: '', poster: '',
    playlistId: '', currentEpisode: 0, latestEpisodeTitle: '', latestVideoUrl: '', latestPublishedAt: '', lastCheckedAt: '',
    updateStatus: 'no_playlist', updateError: '',
    malUrl: '', jikanType: 'TV', jikanStatus: '', rating: '', score: 0,
    season: seasonFromMonth(bangkokMonth(now)), year, catalogYear: year, trailerUrl: '',
    availableEpisodes: [], youtubeAliases: [], youtubeSourceType: '',
    youtubeChannelId: '', youtubeChannelTitle: '', youtubeMatchConfidence: ''
  };
}

// Append a brand-new entry (manual add for anime the pipeline hasn't imported).
// Returns a new array; never mutates `items`.
function applyEntryInsert(items, entry) {
  assertEntryShape(entry);
  if (items.some(item => item.id === entry.id)) {
    throw new UpdateError(409, `id "${entry.id}" is already used by another entry`);
  }
  assertUniqueMalId(items, entry);
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
    let tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Keep draining instead of destroying the socket — destroy() would
        // tear down the shared connection before the 413 response can flush.
        tooLarge = true;
        chunks.length = 0;
        reject(new UpdateError(413, 'request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
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
  if (req.method === 'GET' && pathname === '/api/anime/new-template') {
    sendJson(res, 200, { entry: blankEntryTemplate() });
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
    sendJson(res, 200, { ok: true, hash: entryHash(payload.entry) });
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

// Even though the server only listens on loopback, a DNS-rebinding page can
// become same-origin with 127.0.0.1 and reach the write API — so only accept
// requests that were actually addressed to us.
const ALLOWED_HOSTS = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);

function createServer() {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, `http://${HOST}`).pathname;
    try {
      if (!ALLOWED_HOSTS.has(req.headers.host)) {
        throw new UpdateError(403, `unexpected Host header "${req.headers.host || ''}"`);
      }
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

module.exports = { applyEntryUpdate, applyEntryInsert, blankEntryTemplate, prefillFromJikan, entryHash, createServer };
