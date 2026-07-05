import { TodayPanel } from 'anime-tv-design-system';

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

export function TodayWithRows() {
  return <TodayPanel dateLabel="วันเสาร์ที่ 5 กรกฎาคม 2569" rows={ROWS} onSelectAnime={() => {}} />;
}

export function TodayEmpty() {
  return <TodayPanel dateLabel="วันอังคารที่ 8 กรกฎาคม 2569" rows={[]} onSelectAnime={() => {}} />;
}
