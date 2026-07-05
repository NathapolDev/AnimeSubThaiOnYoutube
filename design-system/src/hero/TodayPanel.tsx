import type { CSSProperties } from 'react';
import type { TodayRowProps } from './TodayRow';
import { TodayRow } from './TodayRow';

export interface TodayPanelProps {
  /** Fully formatted Thai date, e.g. "วันเสาร์ที่ 5 กรกฎาคม 2569". */
  dateLabel: string;
  rows: Omit<TodayRowProps, 'onSelect'>[];
  onSelectAnime: (id: string) => void;
  /** Optional editorial background photo behind the panel (sets the --hero-image token). */
  heroImageUrl?: string;
}

/** Hero panel showing today's airing schedule, or an empty state when nothing airs today. */
export function TodayPanel({ dateLabel, rows, onSelectAnime, heroImageUrl }: TodayPanelProps) {
  const style = heroImageUrl ? ({ '--hero-image': `url(${heroImageUrl})` } as CSSProperties) : undefined;
  return (
    <div className="hero-panel today-panel" aria-labelledby="todayHeading" style={style}>
      <div className="today-heading">
        <div>
          <p className="eyebrow">On Air Today</p>
          <h2 id="todayHeading">ตารางฉายวันนี้</h2>
        </div>
        <span className="today-count">{rows.length} เรื่อง</span>
      </div>
      <p className="today-date">{dateLabel}</p>
      <div className="today-columns" aria-hidden="true">
        <span>เวลา</span>
        <span />
        <span>ชื่อเรื่อง / ตอน</span>
        <span>ช่องทางรับชม</span>
        <span />
      </div>
      <div className="today-schedule" aria-live="polite">
        {rows.length ? (
          rows.map(row => <TodayRow key={row.id} {...row} onSelect={onSelectAnime} />)
        ) : (
          <div className="today-empty">
            <strong>วันนี้ยังไม่มีรายการที่ระบุเวลา</strong>
            <span>ดูตารางทั้งสัปดาห์ได้ด้านล่าง</span>
          </div>
        )}
      </div>
      <a className="today-all-link" href="#schedule">
        ดูตารางทั้งสัปดาห์ →
      </a>
    </div>
  );
}
