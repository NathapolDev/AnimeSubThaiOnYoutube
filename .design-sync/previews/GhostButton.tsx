import { GhostButton } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function ThemeToggleDark() {
  return (
    <Stage>
      <GhostButton aria-label="สลับธีมสี">🌙</GhostButton>
    </Stage>
  );
}

export function ThemeToggleLight() {
  return (
    <Stage>
      <GhostButton aria-label="สลับธีมสี">☀️</GhostButton>
    </Stage>
  );
}
