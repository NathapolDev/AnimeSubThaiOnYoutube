import { WeeklySchedule } from 'anime-tv-design-system';

/** Weekly schedule with a today column, two other days, and an unscheduled bucket. */
export function DefaultSchedule() {
  return (
    <WeeklySchedule
      onSelectAnime={() => {}}
      days={[
        {
          dayLabel: 'วันเสาร์',
          isToday: true,
          items: [
            { id: 'neko-to-ryuu', time: '20:00', titleThai: 'The Cat and the Dragon', subtitle: 'Ani-One • ล่าสุด: ตอนที่ 2' },
          ],
        },
        {
          dayLabel: 'วันจันทร์',
          items: [
            { id: 'world-is-dancing', time: '20:30', titleThai: 'The World Is Dancing', subtitle: 'Muse • ล่าสุด: ตอนที่ 1' },
          ],
        },
        {
          dayLabel: 'วันพฤหัส',
          items: [
            { id: 'bungo-wan-2', time: '19:40', titleThai: 'คณะประพันธกรจรจัด โฮ่ง ซีซั่น 2', subtitle: 'Ani-One • ล่าสุด: ตอนที่ 1' },
          ],
        },
        {
          dayLabel: 'รอประกาศเวลาไทย',
          isUnscheduled: true,
          items: [{ id: 'upcoming-example', time: '—', titleThai: 'ตัวอย่างเรื่องที่ยังไม่ฉาย', subtitle: 'รอช่องทางไทย • ยังไม่เริ่มฉาย' }],
        },
      ]}
    />
  );
}
