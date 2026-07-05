import type { ReactNode } from 'react';

export interface AnimeGridProps {
  /** Rendered <AnimeCard /> elements, or an empty-state note when nothing matches. */
  children: ReactNode;
}

/** Responsive grid container for catalog cards. */
export function AnimeGrid({ children }: AnimeGridProps) {
  return (
    <section className="anime-grid" aria-live="polite">
      {children}
    </section>
  );
}

/** Empty-state note shown inside AnimeGrid when no items match the current filters. */
export function AnimeGridEmpty() {
  return (
    <div className="glass data-note">
      <h2>ไม่พบรายการ</h2>
      <p>ลองเปลี่ยนคำค้นหรือเลือกตัวกรอง "ทั้งหมด"</p>
    </div>
  );
}
