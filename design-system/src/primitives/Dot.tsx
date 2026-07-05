export interface DotProps {
  /** Status color: green for "available", amber for "upcoming". */
  color: 'green' | 'amber';
}

/** Small status indicator dot used in the legend, status badges, and info grid. */
export function Dot({ color }: DotProps) {
  return <span className={`dot ${color}`} />;
}
