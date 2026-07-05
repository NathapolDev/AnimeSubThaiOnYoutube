export interface ScheduleItemProps {
  id: string;
  /** Air time, e.g. "20:30", or "—" for unscheduled entries. */
  time: string;
  titleThai: string;
  /** e.g. "Muse Thailand • ล่าสุด: ตอนที่ 12" */
  subtitle: string;
  onSelect: (id: string) => void;
}

/** One row inside a weekly-schedule day column. */
export function ScheduleItem({ id, time, titleThai, subtitle, onSelect }: ScheduleItemProps) {
  return (
    <button className="schedule-item" type="button" onClick={() => onSelect(id)}>
      <span className="schedule-time">{time}</span>
      <span className="schedule-copy">
        <strong>{titleThai}</strong>
        <span>{subtitle}</span>
      </span>
    </button>
  );
}
