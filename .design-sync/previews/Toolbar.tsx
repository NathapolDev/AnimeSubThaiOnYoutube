import { useState } from 'react';
import { Toolbar } from 'anime-tv-design-system';

const SEASONS = [
  { value: 'winter', label: 'Winter' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'all', label: 'ทั้งปี' },
];
const STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'available', label: 'ดูได้แล้ว' },
  { value: 'upcoming', label: 'รอเริ่มฉาย' },
];
const CHANNELS = [
  { value: 'all', label: 'ทุกช่องทาง' },
  { value: 'Ani-One Thailand', label: 'Ani-One Thailand' },
  { value: 'Muse Thailand', label: 'Muse Thailand' },
];

/** Full catalog filter bar in its default "summer season, all statuses" state. */
export function DefaultToolbar() {
  const [year, setYear] = useState(2026);
  const [season, setSeason] = useState('summer');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [channel, setChannel] = useState('all');
  const [sortBy, setSortBy] = useState<'updated' | 'score' | 'premiere' | 'title'>('updated');

  return (
    <Toolbar
      years={[2027, 2026, 2025]}
      selectedYear={year}
      onYearChange={setYear}
      seasons={SEASONS}
      activeSeason={season}
      onSeasonChange={setSeason}
      query={query}
      onQueryChange={setQuery}
      statusFilters={STATUS_FILTERS}
      activeStatus={status}
      onStatusChange={setStatus}
      favoritesOnly={favoritesOnly}
      onToggleFavoritesOnly={() => setFavoritesOnly(v => !v)}
      channels={CHANNELS}
      activeChannel={channel}
      onChannelChange={setChannel}
      sortBy={sortBy}
      onSortChange={setSortBy}
    />
  );
}

/** Toolbar with an active search query and the favorites-only filter engaged. */
export function FilteredToolbar() {
  return (
    <Toolbar
      years={[2027, 2026, 2025]}
      selectedYear={2026}
      onYearChange={() => {}}
      seasons={SEASONS}
      activeSeason="summer"
      onSeasonChange={() => {}}
      query="มังกร"
      onQueryChange={() => {}}
      statusFilters={STATUS_FILTERS}
      activeStatus="available"
      onStatusChange={() => {}}
      favoritesOnly
      onToggleFavoritesOnly={() => {}}
      channels={CHANNELS}
      activeChannel="Ani-One Thailand"
      onChannelChange={() => {}}
      sortBy="score"
      onSortChange={() => {}}
    />
  );
}
