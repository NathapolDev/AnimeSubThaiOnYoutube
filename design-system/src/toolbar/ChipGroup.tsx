import { Chip } from '../primitives/Chip';

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipGroupProps {
  label: string;
  options: ChipOption[];
  activeValue: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

/** A labeled row of single-select chips — reused for season, status, and channel filters. */
export function ChipGroup({ label, options, activeValue, onChange, ariaLabel }: ChipGroupProps) {
  return (
    <div className="filters" role="group" aria-label={ariaLabel}>
      <span className="filter-group-label">{label}</span>
      {options.map(option => (
        <Chip key={option.value} active={option.value === activeValue} onClick={() => onChange(option.value)}>
          {option.label}
        </Chip>
      ))}
    </div>
  );
}
