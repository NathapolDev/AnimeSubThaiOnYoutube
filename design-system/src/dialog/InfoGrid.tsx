import type { ReactNode } from 'react';

export interface InfoItem {
  label: string;
  /** Rendered value — plain text, or a small element for the status row (dot + label). */
  value: ReactNode;
}

export interface InfoGridProps {
  items: InfoItem[];
}

/** The 2x4 metadata grid in the detail dialog (status, episode, premiere, air time, studio, score, etc.). */
export function InfoGrid({ items }: InfoGridProps) {
  return (
    <div className="info-grid">
      {items.map(item => (
        <div className="info" key={item.label}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
