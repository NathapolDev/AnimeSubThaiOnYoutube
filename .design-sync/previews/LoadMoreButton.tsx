import { LoadMoreButton } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function Default() {
  return (
    <Stage style={{ width: 400 }}>
      <LoadMoreButton remaining={36} onClick={() => {}} />
    </Stage>
  );
}
