# Anime TV Design System

React components for the "editorial broadcast guide" (v2) redesign of the
Anime TV Thai-subtitle catalog site. Extracted from `index-v2.html` /
`styles-v2.css` / `app-v2.js` so the visual design has a real, reusable
component API — the production site itself still ships the plain HTML/CSS/JS
build and does not consume this package (yet).

## Install / build

```sh
cd design-system
npm install
npm run build
```

Emits `dist/index.es.js`, `dist/index.d.ts`, and `dist/style.css`.

## Usage

```tsx
import { AnimeCard, AnimeGrid } from 'anime-tv-design-system';
import 'anime-tv-design-system/style.css';

<AnimeGrid>
  <AnimeCard
    id="neko-to-ryuu"
    titleThai="The Cat and the Dragon"
    titleOriginal="Neko to Ryuu"
    posterUrl="https://cdn.myanimelist.net/images/anime/1878/157796l.webp"
    status="available"
    updateStatus="ok"
    latestText="ล่าสุด: ตอนที่ 2"
    channelLabel="Ani-One"
    genres={['Fantasy', 'Adventure']}
    watchUrl="https://www.youtube.com/watch?v=OpDLemm9U5Q"
    isFavorite={false}
    onToggleFavorite={() => {}}
    onSelect={() => {}}
  />
</AnimeGrid>
```

Every component takes fully static, typed props — no dependency on
`window.ANIME_DATA`, `localStorage`, or the site's `safe-url.js`/`progress.js`
helpers. See `examples/*.usage.tsx` for realistic compositions of every
composite component.

## Components

- **Primitives**: `Chip`, `Badge`, `Dot`, `GhostButton`, `PrimaryButton`, `SecondaryButton`, `ProgressBar`
- **Layout**: `SiteHeader`, `Footer`
- **Hero**: `TodayPanel`, `TodayRow`, `StatsBar`
- **Toolbar**: `Toolbar`, `SearchBox`, `YearPicker`, `SortPicker`, `ChipGroup`
- **Catalog**: `AnimeCard`, `AnimeGrid`, `ResultLine`, `LoadMoreButton`
- **Schedule**: `WeeklySchedule`, `ScheduleDay`, `ScheduleItem`
- **Dialog**: `DetailDialog`, `InfoGrid`, `EpisodeList`, `EpisodeItem`

## Theming

Dark theme is the default. Wrap any subtree in a `.ds-theme-light` class to
switch to the light variant — see `src/tokens.css` for the full token list
(`--bg`, `--accent`, `--card`, etc.).
