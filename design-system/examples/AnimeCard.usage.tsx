import { useState } from 'react';
import { AnimeCard, AnimeGrid } from '../src';

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
    id: 'upcoming-example',
    titleThai: 'ตัวอย่างเรื่องที่ยังไม่ฉาย',
    titleOriginal: 'Upcoming Example',
    status: 'upcoming' as const,
    updateStatus: 'no_playlist' as const,
    latestText: 'ยังไม่เริ่มฉาย',
    channelLabel: 'รอช่องทางไทย',
    genres: ['Action'],
  },
];

/** Catalog grid: a couple of available titles plus an upcoming/no-link card. */
export function CatalogGrid() {
  const [favorites, setFavorites] = useState(new Set(['neko-to-ryuu']));
  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  return (
    <AnimeGrid>
      {SAMPLE.map((item, index) => (
        <AnimeCard
          key={item.id}
          {...item}
          isFavorite={favorites.has(item.id)}
          onToggleFavorite={toggleFavorite}
          onSelect={() => {}}
          eager={index === 0}
        />
      ))}
    </AnimeGrid>
  );
}

/** A single card in its "favorited, mid-progress" state. */
export function SingleCard() {
  return (
    <AnimeCard
      {...SAMPLE[1]}
      isFavorite
      onToggleFavorite={() => {}}
      onSelect={() => {}}
    />
  );
}
