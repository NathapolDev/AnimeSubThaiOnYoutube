export interface EpisodeItemProps {
  /** e.g. "ตอนที่ 12" or "ตอนที่ 1–3" or "ตอนพิเศษ". */
  episodeLabel: string;
  title: string;
  /** Already formatted, e.g. "12 ก.ค. 2569 20:30". */
  publishedAtLabel: string;
  watchUrl?: string;
}

/** One episode row inside the detail dialog's episode list. */
export function EpisodeItem({ episodeLabel, title, publishedAtLabel, watchUrl }: EpisodeItemProps) {
  return (
    <article className="episode-item">
      <div className="episode-number">{episodeLabel}</div>
      <div className="episode-copy">
        <strong>{title || 'ไม่มีชื่อตอน'}</strong>
        <span>{publishedAtLabel}</span>
      </div>
      {watchUrl ? (
        <a className="episode-watch" href={watchUrl} target="_blank" rel="noopener">
          รับชม
        </a>
      ) : null}
    </article>
  );
}
