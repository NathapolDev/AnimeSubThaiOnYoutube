import type { ChangeEvent } from 'react';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Catalog search input with a leading magnifier icon. */
export function SearchBox({ value, onChange, placeholder = 'ค้นชื่อไทย / อังกฤษ / ญี่ปุ่น / แนว / สตูดิโอ' }: SearchBoxProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);
  return (
    <label className="search-box" htmlFor="searchInput">
      <span aria-hidden="true">🔎</span>
      <input
        id="searchInput"
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={handleChange}
      />
    </label>
  );
}
