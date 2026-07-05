import { ScheduleItem } from 'anime-tv-design-system';
import { PaperStage } from './_shared';

export function Default() {
  return (
    <PaperStage style={{ width: 300 }}>
      <ScheduleItem
        id="world-is-dancing"
        time="20:30"
        titleThai="The World Is Dancing"
        subtitle="Muse • ล่าสุด: ตอนที่ 1"
        onSelect={() => {}}
      />
    </PaperStage>
  );
}

export function Unscheduled() {
  return (
    <PaperStage style={{ width: 300 }}>
      <ScheduleItem
        id="upcoming-example"
        time="—"
        titleThai="ตัวอย่างเรื่องที่ยังไม่ฉาย"
        subtitle="รอช่องทางไทย • ยังไม่เริ่มฉาย"
        onSelect={() => {}}
      />
    </PaperStage>
  );
}
