import { Chip } from '../primitives/Chip';
import { SearchBox } from './SearchBox';
import { YearPicker } from './YearPicker';
import { SortPicker, type SortKey } from './SortPicker';
import { ChipGroup, type ChipOption } from './ChipGroup';

export interface ToolbarProps {
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  seasons: ChipOption[];
  activeSeason: string;
  onSeasonChange: (season: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  statusFilters: ChipOption[];
  activeStatus: string;
  onStatusChange: (status: string) => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  channels: ChipOption[];
  activeChannel: string;
  onChannelChange: (channel: string) => void;
  sortBy: SortKey;
  onSortChange: (sortBy: SortKey) => void;
}

/** The full catalog filter bar: search, year/season scope, status/channel filters, and sort. */
export function Toolbar({
  years,
  selectedYear,
  onYearChange,
  seasons,
  activeSeason,
  onSeasonChange,
  query,
  onQueryChange,
  statusFilters,
  activeStatus,
  onStatusChange,
  favoritesOnly,
  onToggleFavoritesOnly,
  channels,
  activeChannel,
  onChannelChange,
  sortBy,
  onSortChange,
}: ToolbarProps) {
  return (
    <section className="toolbar glass" id="catalog">
      <div className="toolbar-head">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2>ค้นหาและกรองรายการ</h2>
        </div>
        <SearchBox value={query} onChange={onQueryChange} />
      </div>

      <div className="catalog-scope">
        <YearPicker years={years} selectedYear={selectedYear} onChange={onYearChange} />
        <div className="season-filters" role="group" aria-label="เลือกฤดูกาล">
          {seasons.map(season => (
            <Chip key={season.value} active={season.value === activeSeason} onClick={() => onSeasonChange(season.value)}>
              {season.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="filters status-filters" role="group" aria-label="ตัวกรองสถานะ">
        <span className="filter-group-label">สถานะ</span>
        {statusFilters.map(status => (
          <Chip key={status.value} active={status.value === activeStatus} onClick={() => onStatusChange(status.value)}>
            {status.label}
          </Chip>
        ))}
        <Chip variant="favorite" active={favoritesOnly} onClick={onToggleFavoritesOnly}>
          ★ รายการโปรด
        </Chip>
      </div>

      <ChipGroup
        label="ช่องทาง"
        ariaLabel="ตัวกรองช่องทาง"
        options={channels}
        activeValue={activeChannel}
        onChange={onChannelChange}
      />

      <div className="filters sort-line">
        <span className="filter-group-label">เรียงตาม</span>
        <SortPicker sortBy={sortBy} onChange={onSortChange} />
      </div>
    </section>
  );
}
