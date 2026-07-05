import type { ScheduleDayProps } from './ScheduleDay';
import { ScheduleDay } from './ScheduleDay';

export interface WeeklyScheduleProps {
  days: Omit<ScheduleDayProps, 'onSelectAnime'>[];
  onSelectAnime: (id: string) => void;
}

/** Weekly broadcast schedule section, grouped by day starting from today. */
export function WeeklySchedule({ days, onSelectAnime }: WeeklyScheduleProps) {
  return (
    <section className="schedule glass" id="schedule">
      <div className="section-heading">
        <p className="eyebrow">Weekly Schedule</p>
        <h2>ตารางฉายรายสัปดาห์</h2>
      </div>
      <div className="schedule-week">
        {days.map(day => (
          <ScheduleDay key={day.dayLabel} {...day} onSelectAnime={onSelectAnime} />
        ))}
      </div>
    </section>
  );
}
