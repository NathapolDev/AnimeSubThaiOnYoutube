import { InfoGrid, Dot } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function AnimeMetadata() {
  return (
    <Stage style={{ width: 460, background: '#041a2b' }}>
      <InfoGrid
        items={[
          {
            label: 'สถานะ',
            value: (
              <>
                <Dot color="green" /> ดูได้แล้ว
              </>
            ),
          },
          { label: 'ตอนล่าสุด', value: 'ตอนที่ 2' },
          { label: 'เริ่มฉาย', value: '27 มิถุนายน 2569' },
          { label: 'เวลาฉาย (ไทย)', value: 'เสาร์ 20:00' },
          { label: 'สตูดิโอ', value: 'OLM' },
          { label: 'คะแนน MAL', value: '★ 7.55' },
        ]}
      />
    </Stage>
  );
}
