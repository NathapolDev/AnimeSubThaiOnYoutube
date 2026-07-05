import { SecondaryButton } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function PlaylistLink() {
  return (
    <Stage>
      <SecondaryButton href="https://www.youtube.com/playlist?list=PLYA5C3ueQ-1g" target="_blank" rel="noopener">
        Playlist ทั้งหมด
      </SecondaryButton>
    </Stage>
  );
}

export function FavoriteToggleButton() {
  return (
    <Stage>
      <SecondaryButton as="button" aria-pressed={true}>
        ★ อยู่ในรายการโปรด
      </SecondaryButton>
    </Stage>
  );
}
