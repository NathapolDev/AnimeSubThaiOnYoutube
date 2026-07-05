import { useState } from 'react';
import { YearPicker } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function Default() {
  const [year, setYear] = useState(2026);
  return (
    <Stage>
      <YearPicker years={[2027, 2026, 2025]} selectedYear={year} onChange={setYear} />
    </Stage>
  );
}
