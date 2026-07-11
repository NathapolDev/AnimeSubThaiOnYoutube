const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOgPage, escapeHtml, truncate, ogImageUrl, BASE_URL } = require('./build-og-pages');

const SAMPLE = {
  id: 'neko-to-ryuu',
  titleThai: 'The Cat and the Dragon',
  titleOriginal: 'Neko to Ryuu',
  summary: 'ลูกมังกรที่เติบโตมากับแม่แมวออกเดินทางเพื่อเข้าใจมนุษย์และหาทางอยู่ร่วมกันอย่างสงบ',
  poster: 'https://cdn.myanimelist.net/images/anime/1878/157796l.webp'
};

test('buildOgPage emits correct og/twitter tags for the item', () => {
  const html = buildOgPage(SAMPLE);
  assert.match(html, /<meta property="og:title" content="The Cat and the Dragon \(Neko to Ryuu\)" \/>/);
  assert.match(html, /<meta property="og:description" content="ลูกมังกร.*" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.myanimelist\.net\/images\/anime\/1878\/157796l\.jpg" \/>/);
  assert.match(html, new RegExp(`<meta property="og:url" content="${BASE_URL}a/neko-to-ryuu\\.html" />`));
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
});

test('ogImageUrl swaps MAL .webp posters to .jpg, which FB/LINE crawlers can render', () => {
  assert.equal(
    ogImageUrl('https://cdn.myanimelist.net/images/anime/1878/157796l.webp'),
    'https://cdn.myanimelist.net/images/anime/1878/157796l.jpg'
  );
});

test('ogImageUrl leaves already-jpg and non-MAL posters untouched', () => {
  assert.equal(
    ogImageUrl('https://cdn.myanimelist.net/images/anime/1878/157796l.jpg'),
    'https://cdn.myanimelist.net/images/anime/1878/157796l.jpg'
  );
  assert.equal(ogImageUrl('https://example.com/poster.webp'), 'https://example.com/poster.webp');
  assert.equal(ogImageUrl(undefined), '');
});

test('buildOgPage serves .jpg to crawlers but keeps the .webp for the browser <img>', () => {
  const html = buildOgPage(SAMPLE);
  assert.match(html, /<meta name="twitter:image" content="[^"]+157796l\.jpg" \/>/);
  assert.match(html, /<img src="https:\/\/cdn\.myanimelist\.net\/images\/anime\/1878\/157796l\.webp"/);
});

test('buildOgPage marks the stub page noindex', () => {
  assert.match(buildOgPage(SAMPLE), /<meta name="robots" content="noindex, follow" \/>/);
});

test('buildOgPage redirects to the SPA deep link', () => {
  const html = buildOgPage(SAMPLE);
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\.\.\/index\.html#a=neko-to-ryuu" \/>/);
  assert.match(html, /location\.replace\("\.\.\/index\.html#a=neko-to-ryuu"\)/);
  assert.match(html, /<a href="\.\.\/index\.html#a=neko-to-ryuu">/);
});

test('escapeHtml escapes HTML-special characters', () => {
  assert.equal(escapeHtml(`<b>"Tom & Jerry's"</b>`), '&lt;b&gt;&quot;Tom &amp; Jerry&#39;s&quot;&lt;/b&gt;');
});

test('buildOgPage escapes titles and summaries containing HTML-special characters', () => {
  const html = buildOgPage({ ...SAMPLE, titleThai: `Tom & Jerry's "Chase"`, titleOriginal: null, summary: `A <cat> & a "dog"` });
  assert.match(html, /<title>Tom &amp; Jerry&#39;s &quot;Chase&quot;<\/title>/);
  assert.match(html, /<meta property="og:description" content="A &lt;cat&gt; &amp; a &quot;dog&quot;" \/>/);
  assert.doesNotMatch(html, /<title>Tom & Jerry/);
});

test('truncate keeps short text unchanged and clamps long text with an ellipsis', () => {
  assert.equal(truncate('short', 200), 'short');
  const long = 'a'.repeat(250);
  const truncated = truncate(long, 200);
  assert.equal(truncated.length, 200);
  assert.ok(truncated.endsWith('…'));
});
