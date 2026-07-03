# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project summary

Static website tracking Thai-subtitled anime on YouTube. No build step — open `index.html` directly. Node.js 22 tools in `tools/` manage data updates.

## Commands

```powershell
# Run all unit tests
node --test tools/*.test.js

# Sync current-year TV anime catalog from Jikan API (no key needed)
node tools/update-jikan.js

# Pull latest episode lists from YouTube playlists (requires API key)
$env:YOUTUBE_API_KEY='your-key'
node tools/update-youtube.js

# Discover episodes from official Thai channel uploads
node tools/discover-youtube.js

# Backfill channel uploads back to 1 Jan of current year
node tools/discover-youtube.js --backfill

# Export research queue for agent-assisted YouTube hunting
node tools/export-youtube-research.js

# Import filled-in research results
node tools/import-youtube-research.js "path\to\youtube-research-queue.updated.json"
```

## Architecture

The data pipeline writes two parallel files after every update:
- `data/anime.json` — canonical source of truth (read/written by all tools)
- `data/anime.js` — `window.ANIME_DATA = <same JSON>` for `file://` use without a server

**Tool chain (run in this order by the GitHub Actions workflow):**
1. `tools/update-jikan.js` — fetches all TV anime for the current Bangkok year from Jikan API across all four seasons; enriches existing entries, inserts new ones, preserves YouTube data
2. `tools/update-youtube.js` — for each anime with a `playlistId`, fetches every playlist page and rebuilds `availableEpisodes`; anime without a playlist get `updateStatus: 'no_playlist'`
3. `tools/discover-youtube.js` — scans upload feeds from whitelisted Thai channels (`data/youtube-channels.json`), matches videos to anime by title substring, merges episodes; ambiguous multi-match results land in `data/youtube-candidates.json`

**Key data fields on each anime entry:**
- `playlistId` — YouTube playlist ID; derived from `link` if `link` is a playlist URL
- `youtubeSourceType` — `'playlist'` (explicit playlist) or `'channel_uploads'` (found via discovery)
- `availableEpisodes` — sorted newest-first; each has `number`, `title`, `videoId`, `videoUrl`, `publishedAt`
- `updateStatus` — `'ok'`, `'no_playlist'`, `'no_episode_found'`, `'error'`
- `youtubeAliases` — extra title strings used for channel-upload matching

**Episode detection heuristics (in `update-youtube.js`):**
- Title exclusion via `EXCLUDED` regex — drops trailers, PVs, OP/ED, promos (Thai and English)
- Episode number parsed from Thai (`ตอนที่ N`), English (`EP. N`, `Episode N`), or `#N` patterns
- If no title in the playlist carries a number, episodes get chronological fallback numbers

**Channel-upload matching (`discover-youtube.js`):**
- `aliasesForAnime` builds a normalized alias set from `titleThai`, `titleOriginal`, `altTitle`, and `youtubeAliases`; only aliases ≥ 6 characters qualify
- `matchVideoToAnime` requires a unique longest-match winner; ties go to `youtube-candidates.json`

**Research import (`import-youtube-research.js`):**
- Validates `schemaVersion: 1` and matches entries by both `id` and `malId` — conflicts on either are skipped with a report
- Will not overwrite an existing `playlistId` with a different incoming one

## GitHub Actions

`update-anime` workflow runs 3x/day at 06:00, 12:00, and 23:00 Bangkok time (23:00, 05:00, 16:00 UTC). Manual dispatch accepts a `backfill` boolean. On success it commits changed data files then chains `deploy-pages.yml`.

Required secret: `YOUTUBE_API_KEY` (YouTube Data API v3). Never commit the key.

## Adding a new anime

Add an object to `data/anime.json` with a unique `id`. Set `link` to the playlist URL (the `list=` param is extracted automatically) or set `playlistId` directly. Run `update-youtube.js` to populate episodes and sync `anime.js`.
