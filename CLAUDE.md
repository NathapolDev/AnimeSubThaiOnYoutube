# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project summary

Static website tracking Thai-subtitled anime on YouTube, Crunchyroll, and Bilibili TV. No build step — open `index.html` directly. Node.js 22 tools in `tools/` manage data updates.

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

# Sync Crunchyroll + Bilibili TV availability + episode lists from AniList (no key needed)
node tools/update-streaming-platforms.js

# Re-filter cached episodes, dropping non-episode clips (highlights, #Shorts, recaps)
node tools/prune-non-episodes.js

# Backfill channel uploads back to 1 Jan of current year
node tools/discover-youtube.js --backfill

# Export research queue for agent-assisted YouTube hunting
node tools/export-youtube-research.js

# Import filled-in research results
node tools/import-youtube-research.js "path\to\youtube-research-queue.updated.json"
```

## Architecture

**Frontend TV mode (`tv.js`):** smart-TV support (Google TV etc.) is a `tv-mode` class on `<body>` — auto-enabled by user-agent sniff, forceable with `?tv=1`/`?tv=0` (persisted) or the 📺 nav toggle. `tv.js` also implements D-pad arrow-key spatial navigation and remote-Back-closes-dialog; all TV styling lives in the `body.tv-mode` block at the end of `styles.css`, so other devices render unchanged. New frontend files must be added to the `cp` line in `.github/workflows/deploy-pages.yml` or GitHub Pages won't ship them.

The data pipeline writes two parallel files after every update:
- `data/anime.json` — canonical source of truth (read/written by all tools), pretty-printed for reviewable diffs
- `data/anime.js` — `window.ANIME_DATA = <same data, minified>` for `file://` use without a server

Both files are written through `tools/write-data.js`; don't write them by hand from a tool. `tools/build-site-data.js` builds the GitHub Pages payload (`_site/data/`) with pipeline-only fields stripped — if `app.js` starts reading a new field, add it to `ITEM_FIELDS`/`EPISODE_FIELDS` (or `CR_FIELDS`/`CR_EPISODE_FIELDS` / `BILI_FIELDS`/`BILI_EPISODE_FIELDS` for the `crunchyroll`/`bilibili` sub-objects) there.

**Tool chain (run in this order by the GitHub Actions workflow):**
1. `tools/update-jikan.js` — fetches all TV anime for the current Bangkok year from Jikan API across all four seasons; near year-end (Oct–Dec) also imports the next year's Winter season so upcoming-season anime enter the catalog early. Enriches existing entries, inserts new ones, preserves YouTube data
2. `tools/update-youtube.js` — for each anime with a `playlistId`, fetches every playlist page and rebuilds `availableEpisodes`; anime without a playlist get `updateStatus: 'no_playlist'`
3. `tools/discover-youtube.js` — scans upload feeds from whitelisted Thai channels (`data/youtube-channels.json`), matches videos to anime by title substring, merges episodes; ambiguous multi-match results land in `data/youtube-candidates.json`
4. `tools/update-streaming-platforms.js` — queries AniList GraphQL by `malId` (batches of 50, throttled under the 30 req/min limit; no key or state file) and rebuilds the `crunchyroll` and `bilibili` sub-objects wholesale each run from a **single** AniList response per batch (`externalLinks`/`streamingEpisodes` already carry every site, so adding a platform costs no extra requests). Driven by a `PLATFORMS` config (`crunchyroll` matches AniList site `'Crunchyroll'`, `bilibili` matches `'Bilibili TV'` — the licensed Thai/SEA global service, deliberately never plain `'Bilibili'`/bilibili.com, the mainland user-upload site): series link from `externalLinks`, per-episode links from `streamingEpisodes`. AniList only carries per-episode links for a minority of Crunchyroll titles and essentially none for Bilibili TV today, so when `streamingEpisodes` is empty the aired-episode count is estimated from the airing schedule (`nextAiringEpisode.episode - 1` while RELEASING, `episodes` when FINISHED) and recorded as `episodeSource: 'estimated_from_airing'` with an empty `availableEpisodes` — `app.js` then synthesizes numbered rows linking to the series page. Runs last on purpose — when a platform has episodes it sets `status: 'available'` (and `confidence: 'confirmed_from_<platform>'` for entries backed only by that platform, reverted if the link later disappears). Priority is YouTube > Crunchyroll > Bilibili: each platform's `outranks` config list stops it from claiming `status`/`confidence` while a higher-priority source already backs the item (checked via `isOutrankedByHigherPlatform`), and platforms are applied to each item in `PLATFORMS` order so Crunchyroll's result is final before Bilibili's check runs. Never touches YouTube-owned fields. Sequel seasons with continuous absolute numbering (e.g. 25–48 for a 24-episode season) are shifted back to season numbering only when the season total confirms the offset (`numberingOffset`, raw kept in `rawNumber`)

**Season window (`catalogYears` in `update-jikan.js`, shared source of truth):**
- All year-scoped tools (`update-jikan`, `discover-youtube`, `scan-unmatched-channel-shows`) resolve the relevant catalog year(s) through `catalogYears()` instead of a bare `bangkokYear()`. The window widens symmetrically around the New Year so cross-boundary subbing is never missed: `[Y]` mid-year, `[Y, Y+1]` in Oct–Dec (upcoming Winter premieres uploaded in late December), `[Y-1, Y]` in Jan–Feb (prior cour still finishing).
- `discover-youtube.js` keys its incremental checkpoint on `min(window)`, which stays stable from October through the following February — so the New Year does not wipe the checkpoint or drop December uploads.
- `discover-youtube.js` and `scan-unmatched-channel-shows.js` accept a `--year 2027` / `--years 2026,2027` override to force a specific window (testing, or backfilling one season).

**Key data fields on each anime entry:**
- `playlistId` — YouTube playlist ID; derived from `link` if `link` is a playlist URL
- `youtubeSourceType` — `'playlist'` (explicit playlist) or `'channel_uploads'` (found via discovery)
- `availableEpisodes` — sorted newest-first; each has `number`, `title`, `videoId`, `videoUrl`, `publishedAt`
- `updateStatus` — `'ok'`, `'no_playlist'`, `'no_episode_found'`, `'error'`
- `youtubeAliases` — extra title strings used for channel-upload matching
- `crunchyroll` — optional sub-object (absent when the anime is not on Crunchyroll per AniList): `seriesUrl`, `availableEpisodes` (`number`, `rawNumber`, `title`, `url`; no `publishedAt` — AniList doesn't provide one), `episodeCount`, `latestEpisodeNumber`, `numberingOffset`, `episodeSource` (`'anilist_links'` real per-episode URLs, `'estimated_from_airing'` count-only estimate from the airing schedule), `lastCheckedAt`, `updateStatus`, `updateError`. AniList-sourced and rebuilt wholesale by `update-streaming-platforms.js`; URLs are upgraded to https because `safe-url.js` rejects plain http
- `bilibili` — same shape as `crunchyroll`, sourced from AniList's `'Bilibili TV'` external link/streaming-episode data by the same tool in the same pass. In practice `episodeSource` is almost always `'estimated_from_airing'` since AniList rarely if ever carries per-episode Bilibili TV links today. Never claims `status`/`confidence` while the item already has a confirmed Crunchyroll entry (see the tool-chain note above)

**Episode detection heuristics (in `update-youtube.js`):**
- Title exclusion via `EXCLUDED` regex — drops trailers, PVs, OP/ED, promos, highlights (`ไฮไลท์`/`highlight`), `#Shorts`, and recap clips (`recap`, `สรุปใน N นาที`), in both Thai and English. `isEpisode` is shared with `discover-youtube.js`, so this single regex gates both the playlist and channel-uploads paths.
- Episode number parsed from Thai (`ตอนที่ N`), English (`EP. N`, `Episode N`), or `#N` patterns
- If no title in the playlist carries a number, episodes get chronological fallback numbers
- `discover-youtube.js` merges episodes but never removes them, so tightening `EXCLUDED` does not retroactively clean already-cached clips. Run `node tools/prune-non-episodes.js` to re-apply the filter to existing `availableEpisodes` and recompute summary fields (an anime left with zero real episodes resets to `no_episode_found`).

**Channel-upload matching (`discover-youtube.js`):**
- `aliasesForAnime` builds a normalized alias set from `titleThai`, `titleOriginal`, `altTitle`, and `youtubeAliases`; only aliases ≥ 6 characters qualify
- `matchVideoToAnime` requires a unique longest-match winner; ties go to `youtube-candidates.json`

**Research import (`import-youtube-research.js`):**
- Validates `schemaVersion: 1` and matches entries by both `id` and `malId` — conflicts on either are skipped with a report
- Will not overwrite an existing `playlistId` with a different incoming one

## GitHub Actions

`update-anime` workflow runs 3x/day at 06:17, 12:17, and 23:17 Bangkok time (23:17, 05:17, 16:17 UTC) — offset from the top of the hour to avoid GitHub Actions' high-load minute-zero scheduling window. Manual dispatch accepts a `backfill` boolean. On success it commits changed data files (rebasing and retrying if main moved during the run) then chains `deploy-pages.yml`, which assembles `_site/` with the slimmed data payload from `tools/build-site-data.js`.

Required secret: `YOUTUBE_API_KEY` (YouTube Data API v3). Never commit the key.

## Adding a new anime

Add an object to `data/anime.json` with a unique `id`. Set `link` to the playlist URL (the `list=` param is extracted automatically) or set `playlistId` directly. Run `update-youtube.js` to populate episodes and sync `anime.js`.
