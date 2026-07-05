import type { ChangeEvent } from 'react';

export type SortKey = 'updated' | 'score' | 'premiere' | 'title';

const OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'อัปเดตล่าสุด' },
  { value: 'score', label: 'คะแนน MAL' },
  { value: 'premiere', label: 'วันเริ่มฉาย' },
  { value: 'title', label: 'ชื่อเรื่อง (ก-ฮ)' },
];

export interface SortPickerProps {
  sortBy: SortKey;
  onChange: (sortBy: SortKey) => void;
}

/** Catalog sort-order select. */
export function SortPicker({ sortBy, onChange }: SortPickerProps) {
  return (
    <label className="sort-picker" htmlFor="sortSelect">
      <select
        id="sortSelect"
        aria-label="เรียงลำดับ"
        value={sortBy}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as SortKey)}
      >
        {OPTIONS.map(option => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
