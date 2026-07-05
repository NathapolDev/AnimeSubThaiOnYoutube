import { AnimeCard, AnimeGrid } from 'anime-tv-design-system';
import { Stage } from './_shared';

const SAMPLE = [
  {
    id: 'neko-to-ryuu',
    titleThai: 'The Cat and the Dragon',
    titleOriginal: 'Neko to Ryuu',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1878/157796l.webp',
    status: 'available' as const,
    updateStatus: 'ok' as const,
    latestText: 'ล่าสุด: ตอนที่ 2',
    hasNewEpisode: true,
    channelLabel: 'Ani-One',
    score: 7.55,
    genres: ['Fantasy', 'Adventure', 'Animal'],
    watchUrl: 'https://www.youtube.com/watch?v=OpDLemm9U5Q',
  },
  {
    id: 'world-is-dancing',
    titleThai: 'The World Is Dancing',
    titleOriginal: 'World Is Dancing',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1165/158709l.webp',
    status: 'available' as const,
    updateStatus: 'ok' as const,
    latestText: 'ล่าสุด: ตอนที่ 1',
    channelLabel: 'Muse',
    score: 7.35,
    genres: ['Historical', 'Drama', 'Performing Arts'],
    progress: { current: 1, total: 13 },
    watchUrl: 'https://www.youtube.com/watch?v=sGFz693H8Kw',
  },
  {
    id: 'bungo-wan-2',
    titleThai: 'คณะประพันธกรจรจัด โฮ่ง ซีซั่น 2',
    titleOriginal: 'Bungo Stray Dogs Wan! 2',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1591/157071l.webp',
    status: 'available' as const,
    updateStatus: 'ok' as const,
    latestText: 'ล่าสุด: ตอนที่ 1',
    channelLabel: 'Ani-One',
    score: 7.1,
    genres: ['Comedy', 'Short', 'Spin-off'],
    watchUrl: 'https://www.youtube.com/watch?v=MQuFqeslReM',
  },
];

export function ThreeCardGrid() {
  return (
    <Stage style={{ width: 720 }}>
      <AnimeGrid>
        {SAMPLE.map((item, index) => (
          <AnimeCard
            key={item.id}
            {...item}
            isFavorite={index === 0}
            onToggleFavorite={() => {}}
            onSelect={() => {}}
            eager={index === 0}
          />
        ))}
      </AnimeGrid>
    </Stage>
  );
}
