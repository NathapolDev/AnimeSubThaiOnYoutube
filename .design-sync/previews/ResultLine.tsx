import { ResultLine } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function MatchCount() {
  return (
    <Stage style={{ width: 420 }}>
      <ResultLine text="พบ 12 จาก 48 รายการ" />
    </Stage>
  );
}

export function FavoritesOnly() {
  return (
    <Stage style={{ width: 420 }}>
      <ResultLine text="รายการโปรด 5 เรื่อง" />
    </Stage>
  );
}
