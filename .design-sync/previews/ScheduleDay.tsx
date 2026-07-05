import { ScheduleDay } from 'anime-tv-design-system';
import { PaperStage } from './_shared';

export function TodayColumn() {
  return (
    <PaperStage style={{ width: 260 }}>
      <ScheduleDay
        dayLabel="วันเสาร์"
        isToday
        items={[
          { id: 'neko-to-ryuu', time: '20:00', titleThai: 'The Cat and the Dragon', subtitle: 'Ani-One • ล่าสุด: ตอนที่ 2' },
        ]}
        onSelectAnime={() => {}}
      />
    </PaperStage>
  );
}

export function UnscheduledColumn() {
  return (
    <PaperStage style={{ width: 260 }}>
      <ScheduleDay
        dayLabel="รอประกาศเวลาไทย"
        isUnscheduled
        items={[
          { id: 'upcoming-example', time: '—', titleThai: 'ตัวอย่างเรื่องที่ยังไม่ฉาย', subtitle: 'รอช่องทางไทย • ยังไม่เริ่มฉาย' },
        ]}
        onSelectAnime={() => {}}
      />
    </PaperStage>
  );
}

export function EmptyDay() {
  return (
    <PaperStage style={{ width: 260 }}>
      <ScheduleDay dayLabel="วันพุธ" items={[]} onSelectAnime={() => {}} />
    </PaperStage>
  );
}
