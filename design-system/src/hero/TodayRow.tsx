export interface TodayRowProps {
  id: string;
  /** Air time, already formatted e.g. "20:30". */
  time: string;
  posterUrl?: string;
  titleThai: string;
  /** e.g. "ล่าสุด: ตอนที่ 12" */
  latestText: string;
  hasNewEpisode?: boolean;
  channel: string;
  onSelect: (id: string) => void;
}

/** One row in the "on air today" panel: air time, poster, title, and channel. */
export function TodayRow({ id, time, posterUrl, titleThai, latestText, hasNewEpisode, channel, onSelect }: TodayRowProps) {
  return (
    <button className="today-row" type="button" onClick={() => onSelect(id)}>
      <span className="today-time">{time}</span>
      <span className="today-thumb">
        {posterUrl ? (
          <img className="poster" src={posterUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="poster-fallback is-shown" aria-hidden="true">
            ไม่มีรูป
          </span>
        )}
      </span>
      <span className="today-copy">
        <strong>{titleThai}</strong>
        <small className="today-episode">
          {latestText}
          {hasNewEpisode ? ' • มีตอนใหม่' : ''}
        </small>
      </span>
      <span className="today-channel">
        <small>ช่องทางรับชม</small>
        <strong>{channel}</strong>
      </span>
      <span className="today-detail">รายละเอียด</span>
    </button>
  );
}
