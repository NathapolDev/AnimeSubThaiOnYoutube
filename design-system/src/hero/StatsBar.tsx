export interface Stat {
  value: number | string;
  label: string;
}

export interface StatsBarProps {
  stats: Stat[];
}

/** Catalog-wide stat tiles shown beside the today panel (anime count, availability, episodes, new-today). */
export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="stats-bar" aria-label="สถิติแคตตาล็อก">
      {stats.map(stat => (
        <div className="stat" key={stat.label}>
          <span>{stat.value}</span>
          <small>{stat.label}</small>
        </div>
      ))}
    </div>
  );
}
