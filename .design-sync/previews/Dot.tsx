import { Dot } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function AvailableLegend() {
  return (
    <Stage>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
        <Dot color="green" /> ดูได้แล้ว
      </p>
    </Stage>
  );
}

export function UpcomingLegend() {
  return (
    <Stage>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
        <Dot color="amber" /> รอเริ่มฉาย
      </p>
    </Stage>
  );
}
