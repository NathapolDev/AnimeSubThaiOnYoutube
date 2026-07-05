import { Chip } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function Default() {
  return (
    <Stage>
      <Chip>Winter</Chip>
    </Stage>
  );
}

export function ActiveSeason() {
  return (
    <Stage>
      <Chip active onClick={() => {}}>
        Summer
      </Chip>
    </Stage>
  );
}

export function FavoriteInactive() {
  return (
    <Stage>
      <Chip variant="favorite">★ รายการโปรด</Chip>
    </Stage>
  );
}

export function FavoriteActive() {
  return (
    <Stage>
      <Chip variant="favorite" active>
        ★ รายการโปรด
      </Chip>
    </Stage>
  );
}
