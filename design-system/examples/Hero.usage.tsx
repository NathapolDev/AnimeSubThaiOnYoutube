import { TodayPanel, StatsBar } from '../src';

const ROWS = [
  {
    id: 'world-is-dancing',
    time: '20:30',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1165/158709l.webp',
    titleThai: 'The World Is Dancing',
    latestText: 'ล่าสุด: ตอนที่ 1',
    hasNewEpisode: true,
    channel: 'Muse',
  },
  {
    id: 'bungo-wan-2',
    time: '19:40',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1591/157071l.webp',
    titleThai: 'คณะประพันธกรจรจัด โฮ่ง ซีซั่น 2',
    latestText: 'ล่าสุด: ตอนที่ 1',
    channel: 'Ani-One',
  },
];

/** Today panel with two airing titles for the day. */
export function TodayWithRows() {
  return <TodayPanel dateLabel="วันเสาร์ที่ 5 กรกฎาคม 2569" rows={ROWS} onSelectAnime={() => {}} />;
}

/** Today panel with nothing scheduled — the empty state. */
export function TodayEmpty() {
  return <TodayPanel dateLabel="วันอังคารที่ 8 กรกฎาคม 2569" rows={[]} onSelectAnime={() => {}} />;
}

/** Catalog-wide stat tiles shown beside the today panel. */
export function CatalogStats() {
  return (
    <StatsBar
      stats={[
        { value: 148, label: 'อนิเมะ TV ปี 2026' },
        { value: 92, label: 'มีซับไทยให้ดู' },
        { value: 1204, label: 'ตอนที่รับชมได้' },
        { value: 11, label: 'อัปเดตใน 48 ชม.' },
      ]}
    />
  );
}
