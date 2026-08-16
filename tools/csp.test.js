const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STUB_CSP } = require('./build-og-pages');

const ROOT = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');

const indexHtml = read('index.html');
const appJs = read('app.js');
const headersFile = read('_headers');

// An inline event handler is script under CSP, so one reintroduced anywhere in the markup or in
// app.js's innerHTML templates would silently stop working under script-src 'self'. Matching on a
// quote after the `=` keeps `element.onclick = fn` property assignments out of the results.
const INLINE_HANDLER = /\son[a-z]+\s*=\s*["']/g;

function metaCsp(html) {
  const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(match, 'no <meta http-equiv="Content-Security-Policy"> found');
  return match[1];
}

function directives(policy) {
  return Object.fromEntries(policy.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const [name, ...values] = part.split(/\s+/);
    return [name, values];
  }));
}

test('index.html ships a CSP, above every tag it has to cover', () => {
  const policy = metaCsp(indexHtml);
  const cspAt = indexHtml.indexOf('<meta http-equiv="Content-Security-Policy"');
  const firstLoad = indexHtml.search(/<(?:link|script|img)\b/);
  assert.ok(firstLoad > cspAt, 'a resource-loading tag precedes the CSP meta tag, so it escapes the policy');
  assert.deepEqual(directives(policy)['default-src'], ["'self'"]);
});

test('index.html declares a referrer policy', () => {
  assert.match(indexHtml, /<meta name="referrer" content="strict-origin-when-cross-origin" \/>/);
});

test('the CSP names every host index.html actually loads from', () => {
  const csp = directives(metaCsp(indexHtml));
  // Only tags that fetch something — <link rel="preconnect"> opens a socket but loads nothing,
  // so CSP never sees it.
  const stylesheets = [...indexHtml.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(https:\/\/[^/"]+)/g)];
  for (const [, host] of stylesheets) {
    assert.ok(csp['style-src'].includes(host), `stylesheet host ${host} missing from style-src`);
  }
  assert.ok(csp['style-src'].includes('https://fonts.googleapis.com'), 'Google Fonts stylesheet host missing');
  // Google's css2 response points its @font-face rules at a second host.
  assert.ok(csp['font-src'].includes('https://fonts.gstatic.com'), 'Google Fonts file host missing');
});

test('the CSP covers the host every poster in the catalog is served from', () => {
  const csp = directives(metaCsp(indexHtml));
  const items = JSON.parse(read('data/anime.json'));
  const hosts = new Set(items.map(item => item.poster).filter(Boolean)
    .map(url => (url.match(/^(https?:\/\/[^/]+)/) || [])[1]));
  for (const host of hosts) {
    assert.ok(csp['img-src'].includes(host), `poster host ${host} missing from img-src — posters would not render`);
  }
});

test('the CSP grants no inline or eval escape hatch', () => {
  const policy = metaCsp(indexHtml);
  assert.doesNotMatch(policy, /'unsafe-inline'/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
  assert.doesNotMatch(policy, /'unsafe-hashes'/);
  assert.deepEqual(directives(policy)['script-src'], ["'self'"]);
});

test('index.html has no inline script for the CSP to block', () => {
  const scripts = [...indexHtml.matchAll(/<script\b([^>]*)>/g)];
  assert.ok(scripts.length > 0, 'expected index.html to load scripts');
  for (const [, attrs] of scripts) {
    assert.match(attrs, /\ssrc="/, `inline <script> found in index.html: <script${attrs}>`);
  }
});

test('no inline event handler survives in index.html or app.js templates', () => {
  assert.deepEqual(indexHtml.match(INLINE_HANDLER) ?? [], [], 'inline event handler in index.html');
  // app.js:posterHtml() used to emit onerror= here; it is a delegated listener now. Anything
  // matching again means a template started emitting script the CSP will refuse to run.
  assert.deepEqual(appJs.match(INLINE_HANDLER) ?? [], [], 'inline event handler in an app.js template literal');
});

test('app.js keeps the poster fallback working without an inline handler', () => {
  const listener = appJs.indexOf("document.addEventListener('error'");
  assert.ok(listener !== -1, 'the delegated poster error listener is gone');
  // error does not bubble, so the listener only ever fires if it is registered for capture.
  assert.match(appJs.slice(listener, listener + 400), /\}, true\);/, 'capture phase is required');
  assert.match(appJs, /classList\.add\('is-missing'\)/);
  // It has to be registered before the first posters exist, or their errors are missed outright.
  const bootstrap = appJs.indexOf('renderCatalogViews();');
  assert.ok(bootstrap !== -1 && listener < bootstrap, 'listener must be registered before the first render');
});

test('_headers carries the headers a meta tag cannot express', () => {
  const set = Object.fromEntries(headersFile.split('\n')
    .filter(line => /^\s+[\w-]+:/.test(line))
    .map(line => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]));
  assert.equal(set['X-Content-Type-Options'], 'nosniff');
  assert.equal(set['X-Frame-Options'], 'DENY');
  assert.equal(set['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.ok(set['Permissions-Policy'], 'Permissions-Policy missing');
  assert.match(set['Strict-Transport-Security'], /max-age=\d+/);
  assert.match(set['Content-Security-Policy'], /frame-ancestors 'none'/);
});

test('_headers and index.html state the same policy, bar the meta-only gap', () => {
  const fromHeaders = directives(headersFile.match(/^\s+Content-Security-Policy:\s*(.+)$/m)[1]);
  const fromMeta = directives(metaCsp(indexHtml));
  // Browsers ignore both of these in a meta tag, so they are header-only by design.
  delete fromHeaders['frame-ancestors'];
  delete fromHeaders['upgrade-insecure-requests'];
  assert.deepEqual(fromHeaders, fromMeta, '_headers CSP has drifted from index.html — update both');
});

test('Permissions-Policy leaves the share button alone', () => {
  // navigator.share and navigator.clipboard.writeText in app.js shareItem() default to an
  // allowlist of self, so naming them here at all would switch them off.
  const policy = headersFile.match(/^\s+Permissions-Policy:\s*(.+)$/m)[1];
  assert.doesNotMatch(policy, /clipboard-write|web-share/);
});

test('the OG stub policy stays as strict as the homepage', () => {
  const stub = directives(STUB_CSP);
  assert.deepEqual(stub['script-src'], ["'none'"], 'stub pages redirect declaratively and need no script');
  assert.deepEqual(stub['default-src'], ["'none'"]);
  assert.doesNotMatch(STUB_CSP, /'unsafe-inline'|'unsafe-eval'|'unsafe-hashes'/);
});

test('the deploy workflow ships _headers', () => {
  assert.match(read('.github/workflows/deploy-pages.yml'), /^\s*cp _headers _site\/$/m);
});
