import { useState } from 'react';
import { SortPicker, type SortKey } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function Default() {
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  return (
    <Stage>
      <SortPicker sortBy={sortBy} onChange={setSortBy} />
    </Stage>
  );
}
