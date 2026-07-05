import type { ScheduleItemProps } from './ScheduleItem';
import { ScheduleItem } from './ScheduleItem';

export interface ScheduleDayProps {
  /** e.g. "วันเสาร์" or "รอประกาศเวลาไทย" for the unscheduled bucket. */
  dayLabel: string;
  isToday?: boolean;
  isUnscheduled?: boolean;
  items: Omit<ScheduleItemProps, 'onSelect'>[];
  onSelectAnime: (id: string) => void;
}

/** One day column in the weekly schedule grid. */
export function ScheduleDay({ dayLabel, isToday, isUnscheduled, items, onSelectAnime }: ScheduleDayProps) {
  const classes = ['schedule-day', isToday ? 'is-today' : '', isUnscheduled ? 'is-unscheduled' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <section className={classes}>
      <h3>
        {dayLabel}
        {isToday ? <span className="today-tag">วันนี้</span> : null}
      </h3>
      <div className="schedule-rows">
        {items.length ? (
          items.map(item => <ScheduleItem key={item.id} {...item} onSelect={onSelectAnime} />)
        ) : (
          <p className="schedule-empty">ไม่มีรายการออกอากาศในขอบเขตที่เลือก</p>
        )}
      </div>
    </section>
  );
}
