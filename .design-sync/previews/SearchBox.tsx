import { useState } from 'react';
import { SearchBox } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function Empty() {
  const [value, setValue] = useState('');
  return (
    <Stage style={{ width: 360 }}>
      <SearchBox value={value} onChange={setValue} />
    </Stage>
  );
}

export function WithQuery() {
  const [value, setValue] = useState('มังกร');
  return (
    <Stage style={{ width: 360 }}>
      <SearchBox value={value} onChange={setValue} />
    </Stage>
  );
}
