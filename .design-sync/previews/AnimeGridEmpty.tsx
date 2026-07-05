import { AnimeGrid, AnimeGridEmpty } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function NoResults() {
  return (
    <Stage style={{ width: 500 }}>
      <AnimeGrid>
        <AnimeGridEmpty />
      </AnimeGrid>
    </Stage>
  );
}
