import { useState } from 'react';
import { ChipGroup } from 'anime-tv-design-system';
import { Stage } from './_shared';

const CHANNELS = [
  { value: 'all', label: 'ทุกช่องทาง' },
  { value: 'Ani-One Thailand', label: 'Ani-One Thailand' },
  { value: 'Muse Thailand', label: 'Muse Thailand' },
];

export function ChannelFilter() {
  const [active, setActive] = useState('all');
  return (
    <Stage style={{ width: 500 }}>
      <ChipGroup label="ช่องทาง" ariaLabel="ตัวกรองช่องทาง" options={CHANNELS} activeValue={active} onChange={setActive} />
    </Stage>
  );
}
