---
name: find-missing-youtube-episodes
description: Find anime that are actually available on the whitelisted Thai YouTube channels but that discover-youtube.js failed to match, because anime.json's titleThai/aliases don't match the Thai title the channel actually uses. Use when the user asks to check for anime with missing YouTube links, missing Thai names, or wants another discovery pass.
---

# Find missing YouTube episodes for anime lacking a matched Thai title

## Background

`tools/discover-youtube.js` matches YouTube channel uploads to `data/anime.json` entries by
substring-matching normalized aliases (`titleThai`, `titleOriginal`, `altTitle`, `youtubeAliases`,
each must normalize to >=6 chars). Two structural reasons an anime that IS actually on YouTube
still won't show up:

1. **Incremental scan only.** By default the script stops at the last-seen video checkpoint
   (`data/youtube-discovery-state.json`). Older episodes already uploaded before that checkpoint
   are invisible unless you pass `--backfill` (rescans back to 1 Jan of the current Bangkok year).
2. **`titleThai` is often an English localized title, not the actual Thai text the channel puts
   in its video titles.** E.g. `titleThai: "Frieren: Beyond Journey's End Season 2"` but the real
   channel title is `คำอธิษฐานในวันที่จากลา FRIEREN`. No amount of substring matching against the
   stored `titleThai` will ever find this — the real Thai name has to be identified and added to
   `youtubeAliases` by hand (or by an agent with translation knowledge).

## Workflow

Requires `YOUTUBE_API_KEY` (YouTube Data API v3, free tier is plenty — full-year channel scans
cost roughly ~100 quota units total against a 10,000/day default quota).

```powershell
$env:YOUTUBE_API_KEY='<key>'
```

1. **Backfill pass first** (cheap, catches anything reachable with existing aliases):
   ```powershell
   node tools/discover-youtube.js --backfill
   ```

2. **Scan whitelisted channels for unmatched show names:**
   ```powershell
   node tools/scan-unmatched-channel-shows.js
   ```
   This fetches every 2026 upload from every channel in `data/youtube-channels.json`, keeps only
   videos that look like real episodes (`isEpisode()` from `update-youtube.js` — excludes
   trailers/PVs/shorts), groups them by extracted show name, and writes
   `data/thai-title-candidates.json` with only shows that:
   - have been uploaded within the last 60 days (still airing / recently active)
   - have <=20 episodes so far (filters out long-running back-catalog like Bleach/Gintama)
   - don't already substring-match any existing anime alias

3. **Identify each candidate manually** (this is the step that needs an LLM/human, not code).
   For each `showName` in `data/thai-title-candidates.json`, use translation/domain knowledge to
   figure out which `data/anime.json` entry (by `titleOriginal`) it corresponds to. Useful
   shortcuts when the Thai is ambiguous:
   - Search `anime.json` for genre/plot keywords in English that plausibly translate the Thai
     phrase (e.g. "villainess", "queen", "monster", "fishing", "riddle", "sword") — see history in
     this project for examples of matches found this way.
   - Ignore candidates that are clearly PV/character-intro fragments joined with `|` unless they
     also correspond to a real recurring episode-numbered upload.
   - Cross-check plausible matches against MAL (`malUrl` field) if unsure.

4. **Add confirmed matches as aliases**, then rerun discovery:
   ```js
   // one-off node -e script, or Edit tool on anime.json directly:
   item.youtubeAliases = [...new Set([...(item.youtubeAliases||[]), '<exact Thai show name found>'])];
   ```
   Regenerate `data/anime.js` alongside (`window.ANIME_DATA = <json>`) — never hand-edit it,
   `discover-youtube.js`/`import-youtube-research.js` do this automatically when run.
   ```powershell
   node tools/discover-youtube.js --backfill
   ```

5. **Verify:** `node --test tools/*.test.js` (all 21 tests should still pass) and spot-check
   `availableEpisodes.length` on the newly matched entries.

6. **Repeat steps 2-5** — each round of added aliases can occasionally unblock more scan
   candidates (shows near the 20-episode cutoff, etc). Diminishing returns after 2-3 rounds.

## Plan for anime that still can't be found

After a full backfill + candidate scan finds nothing, split the remainder into:

- **Not yet aired** (`jikanStatus !== 'Currently Airing'/'Finished Airing'` or premiere date in the
  future) — nothing to do yet; they'll surface naturally in a future scan once they start
  uploading.
- **Aired/airing but absent from all 3 whitelisted channels** — most likely licensed exclusively
  to paid platforms (Crunchyroll, iQIYI, TrueID, WeTV, LINE TV, Netflix) rather than the free
  YouTube channels this project tracks. This is expected and not a bug — don't keep re-researching
  the same title every session. Optionally record `youtubeResearchStatus: 'not_on_tracked_channels'`
  via the export/import research queue (`tools/export-youtube-research.js` /
  `tools/import-youtube-research.js`) so future scans can skip re-checking obviously-absent titles.

Recommended cadence: rerun this whole skill once a month, or right after a new anime season
starts (new-season Thai titles take a few weeks to stabilize on the channels), rather than per
session — quota cost is trivial but the manual identification step is the bottleneck.
