import type { CSSProperties, ReactNode } from 'react';

/**
 * Preview-only helper: the DS pane's card grid forces a white page background, but this
 * design system's chrome (chips, badges, ghost buttons, dots...) is styled for the dark
 * "editorial broadcast guide" canvas the real site always renders on. Wrap standalone atoms
 * in this so their real contrast shows, matching how they actually appear on the page.
 * Not a library export — a plain sibling module for the other preview files to import.
 */
export function Stage({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', padding: 20, display: 'inline-block', ...style }}>
      {children}
    </div>
  );
}

/**
 * The weekly-schedule section is a deliberate light "paper" panel even in the
 * dark theme (`.schedule { background: #f2eee4; color: #071d30 }`) — ScheduleDay
 * and ScheduleItem previewed alone need that same ambient background, not the
 * page's dark canvas, to render with their real (dark-on-light) contrast.
 */
export function PaperStage({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: '#f2eee4', color: '#071d30', padding: 20, display: 'inline-block', ...style }}>
      {children}
    </div>
  );
}
