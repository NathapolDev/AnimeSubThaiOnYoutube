# Design-sync notes

## Known font substitution

- The font stack (`tokens.css`) is `"Noto Sans Thai", "Leelawadee UI", Tahoma, ui-sans-serif, system-ui, sans-serif`.
  `Leelawadee UI` is a Windows-only proprietary font and can't be shipped in the bundle.
  User approved (2026-07-05) accepting the system/fallback substitute for this font only —
  `Noto Sans Thai` is the real primary font and is already covered (validate did not flag it,
  implying it's available as a system font in the render environment). If a future validate
  run flags `Noto Sans Thai` itself as missing, that needs real sourcing (it's a free Google
  Font) — don't silently accept a substitute for the primary typeface.

## Re-sync risks

- The component library (`design-system/`) is a from-scratch extraction of the still-in-progress
  v2 redesign (`index-v2.html`/`styles-v2.css`/`app-v2.js`, currently untracked on the
  `codex/redesign-v2` branch) — it is NOT wired to the production site. If the v2 redesign's
  markup/CSS changes before it ships, `design-system/` will silently drift from the live site
  and needs a manual re-extraction, not just a rebuild.
- Static sample data in `design-system/examples/*.usage.tsx` was borrowed from three real
  `data/anime.json` entries at sync time (2026-07-05) — those specific anime may finish airing
  or lose their YouTube playlists later; the examples are frozen snapshots, not live data.
