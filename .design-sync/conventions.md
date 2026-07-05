## Using this design system

This is the "editorial broadcast guide" (v2) redesign of a Thai-subtitle anime
catalog site — a dark, magazine-style theme with one deliberate light "paper"
section for the weekly schedule.

### Required page wrapper — read this first

Components do **not** ship their own page background. The bundle assumes a
host page that sets:

```css
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); }
```

Skip this and most components render nearly invisible: chips, ghost buttons,
search boxes, pickers, and stat tiles use transparent or translucent
backgrounds with light (`var(--text)`) foreground colors — they're designed to
sit on the dark canvas above, not a plain white page. `AnimeCard`,
`DetailDialog`, and `Badge` ship their own near-opaque backgrounds and are
safe to render on any canvas.

**Exception — the weekly schedule is deliberately light-on-dark-site**:
`WeeklySchedule` sets its own `background: #f2eee4; color: #071d30` (a paper
panel breaking the dark theme on purpose). `ScheduleDay` and `ScheduleItem`
inherit that look and expect to be composed inside it, not placed directly on
the dark page background.

### Theming

Dark is the default (`:root`). Add the `ds-theme-light` class to a wrapping
element to switch every token to the light palette — never toggle theme via
a different mechanism (no `data-theme` attribute, no CSS-in-JS).

### Styling idiom — plain CSS classes, real component classes

No utility classes, no CSS-in-JS. Every component renders its own named class
(`anime-card`, `chip`, `badge`, `search-box`, `schedule-item`, `detail-dialog`,
...) styled entirely through CSS custom properties — never hardcode a color,
reuse the token instead:

| Token | Role |
|---|---|
| `--bg`, `--bg2` | page background (gradient stops) |
| `--card`, `--card2` | translucent panel/card fills |
| `--text`, `--muted` | primary / secondary text |
| `--accent`, `--accent2` | brand accent pair (cyan/coral in dark, same pair in light) |
| `--green`, `--amber` | status colors (available / upcoming) |
| `--line` | hairline borders |
| `--shadow` | panel drop shadow |
| `--page-pad` | responsive page gutter |

Don't invent new class names or a utility system for new components — extend
an existing component's class, or add a sibling rule following the same
`kebab-case` naming already in `styles.css`.

### Where the truth lives

Read `tokens.css` (full token list, both themes) and `styles.css` (every
component's real rules, source-ordered so later rules — the v2 "editorial"
look — correctly override earlier v1-era base rules) before styling anything
new. Per-component API is each `<Name>.d.ts`; usage patterns are in
`.prompt.md`.

### Building with it

```tsx
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
```

Every prop is static/typed — no dependency on global data, `localStorage`, or
any site-specific helper. Compose new screens the same way: pass real props
in, let the parent page own state and side effects.
