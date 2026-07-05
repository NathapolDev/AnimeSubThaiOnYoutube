import { StatsBar } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function CatalogStats() {
  return (
    <Stage style={{ width: 640 }}>
      <StatsBar
        stats={[
          { value: 148, label: 'อนิเมะ TV ปี 2026' },
          { value: 92, label: 'มีซับไทยให้ดู' },
          { value: 1204, label: 'ตอนที่รับชมได้' },
          { value: 11, label: 'อัปเดตใน 48 ชม.' },
        ]}
      />
    </Stage>
  );
}
