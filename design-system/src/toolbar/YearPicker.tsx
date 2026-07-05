import type { ChangeEvent } from 'react';

export interface YearPickerProps {
  years: number[];
  selectedYear: number;
  onChange: (year: number) => void;
}

/** Year-scope select used to switch the whole catalog to a different broadcast year. */
export function YearPicker({ years, selectedYear, onChange }: YearPickerProps) {
  return (
    <label className="year-picker" htmlFor="yearSelect">
      <span>ปี</span>
      <select
        id="yearSelect"
        aria-label="เลือกปี"
        value={selectedYear}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(Number(event.target.value))}
      >
        {years.map(year => (
          <option value={year} key={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  );
}
