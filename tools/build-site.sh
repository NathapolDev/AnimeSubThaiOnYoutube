#!/usr/bin/env bash
# Assembles the deployable static site into _site/.
#
# Shared by both deploy workflows (GitHub Pages and Cloudflare Pages) so the two
# targets can never drift on what actually gets shipped. Note that admin/ is
# deliberately absent from the copy list — the local-only editor must never be
# deployed; keep it that way when adding files here.
#
# Env:
#   SITE_BASE_URL  absolute origin+path the OG share stubs advertise as their
#                  canonical URL (see tools/build-og-pages.js). Defaults to the
#                  GitHub Pages URL when unset.
set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf _site
mkdir -p _site/data
cp index.html app.js safe-url.js progress.js styles.css _site/
cp -R assets _site/assets
node tools/build-site-data.js _site/data
node tools/build-og-pages.js _site
# Pages caches assets by filename, so a returning browser would pair the fresh
# index.html with a stale app.js/styles.css. Version every local asset ref with
# its own content hash: changed files bust the cache, unchanged files keep stable
# URLs and revalidate to 304s.
node tools/stamp-asset-version.js _site/index.html
# Cache-Control rules for Cloudflare Pages; GitHub Pages ignores the file.
cp public/_headers _site/_headers
# Without a 404.html, Cloudflare Pages answers unmatched paths with index.html
# and a 200 — a soft 404. Both hosts pick this file up by convention.
cp public/404.html _site/404.html
touch _site/.nojekyll

echo "Static site assembled -> _site"
