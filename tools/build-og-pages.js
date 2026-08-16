const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'anime.json');
const BASE_URL = 'https://nathapoldev.github.io/AnimeSubThaiOnYoutube/';
const SUMMARY_LIMIT = 200;

// These pages exist only so a link crawler (LINE/Facebook/Twitter) sees a
// per-anime title/image/description before a human is redirected into the
// real SPA — the app's own deep link is a #a=<id> hash fragment, which is
// never sent to the server, so a single index.html can't vary its OG tags
// per anime.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function truncate(text, limit) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

// Facebook's and LINE's crawlers don't render WebP, so an og:image pointing at
// a .webp poster unfurls with no picture at all. MAL serves the same poster as
// .jpg at the same path, so swap only the crawler-facing URL; the <img> below
// keeps the .webp a real browser handles fine.
function ogImageUrl(poster) {
  const url = String(poster ?? '');
  return /^https:\/\/cdn\.myanimelist\.net\//.test(url) ? url.replace(/\.webp$/, '.jpg') : url;
}

// GitHub Pages can't set response headers, so each stub carries its own policy. A stub loads
// exactly one thing — the poster — and redirects declaratively, so script is denied outright.
// That is why the redirect below is a meta refresh and not the location.replace() this page used
// to inline: no script means no per-page CSP hash across ~300 generated pages.
const STUB_CSP = "default-src 'none'; script-src 'none'; img-src https://cdn.myanimelist.net; base-uri 'none'; form-action 'none'";

function buildOgPage(item) {
  const title = item.titleOriginal && item.titleOriginal !== item.titleThai
    ? `${item.titleThai} (${item.titleOriginal})`
    : item.titleThai;
  const safeTitle = escapeHtml(title);
  const description = escapeHtml(truncate(item.summary, SUMMARY_LIMIT));
  const image = escapeHtml(item.poster || '');
  const shareImage = escapeHtml(ogImageUrl(item.poster));
  const pageUrl = `${BASE_URL}a/${encodeURIComponent(item.id)}.html`;
  const redirectTarget = `../index.html#a=${encodeURIComponent(item.id)}`;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="${STUB_CSP}" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>${safeTitle}</title>
  <meta name="robots" content="noindex, follow" />
  <!-- A zero-delay refresh navigates with history handling "replace", so Back returns the
       visitor to wherever they came from rather than bouncing off this stub again. -->
  <meta http-equiv="refresh" content="0; url=${redirectTarget}" />
  <meta property="og:type" content="video.tv_show" />
  <meta property="og:site_name" content="Anime TV Catalog — Thai YouTube Tracker" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:image" content="${shareImage}" />
  <meta property="og:locale" content="th_TH" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${shareImage}" />
</head>
<body>
  <img src="${image}" alt="${safeTitle}" />
  <p>${description}</p>
  <p><a href="${redirectTarget}">ดู ${safeTitle} บน Anime TV Catalog</a></p>
</body>
</html>
`;
}

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(ROOT, '_site'));
  const items = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const pagesDir = path.join(outDir, 'a');
  await fs.mkdir(pagesDir, { recursive: true });
  for (const item of items) {
    await fs.writeFile(path.join(pagesDir, `${item.id}.html`), buildOgPage(item), 'utf8');
  }
  console.log(`OG share pages built: ${items.length} pages -> ${path.relative(ROOT, pagesDir)}`);
}

if (require.main === module) main().catch(error => { console.error(`OG page build failed: ${error.message}`); process.exitCode = 1; });

module.exports = { buildOgPage, escapeHtml, truncate, ogImageUrl, BASE_URL, STUB_CSP };
