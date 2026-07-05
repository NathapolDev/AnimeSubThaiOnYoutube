export interface ProgressBarProps {
  /** Episodes found from YouTube so far. */
  current: number;
  /** Total episode count reported by MyAnimeList/Jikan, when known. */
  total: number;
}

/** Episode-tracking progress bar shown on catalog cards ("12/24 ตอน"). */
export function ProgressBar({ current, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="progress" role="img" aria-label={`พบตอนจาก YouTube ${current} จาก ${total} ตอน`}>
      <i style={{ width: `${percent}%` }} />
      <span>{current}/{total}</span>
    </div>
  );
}
