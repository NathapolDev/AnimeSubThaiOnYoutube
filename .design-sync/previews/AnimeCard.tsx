import { useState } from 'react';
import { AnimeCard } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function AvailableFavorited() {
  const [isFavorite, setIsFavorite] = useState(true);
  return (
    <Stage style={{ width: 240 }}>
      <AnimeCard
        id="neko-to-ryuu"
        titleThai="The Cat and the Dragon"
        titleOriginal="Neko to Ryuu"
        posterUrl="https://cdn.myanimelist.net/images/anime/1878/157796l.webp"
        status="available"
        updateStatus="ok"
        latestText="ล่าสุด: ตอนที่ 2"
        hasNewEpisode
        channelLabel="Ani-One"
        score={7.55}
        genres={['Fantasy', 'Adventure', 'Animal']}
        watchUrl="https://www.youtube.com/watch?v=OpDLemm9U5Q"
        isFavorite={isFavorite}
        onToggleFavorite={() => setIsFavorite(v => !v)}
        onSelect={() => {}}
      />
    </Stage>
  );
}

export function WithProgress() {
  return (
    <Stage style={{ width: 240 }}>
      <AnimeCard
        id="world-is-dancing"
        titleThai="The World Is Dancing"
        titleOriginal="World Is Dancing"
        posterUrl="https://cdn.myanimelist.net/images/anime/1165/158709l.webp"
        status="available"
        updateStatus="ok"
        latestText="ล่าสุด: ตอนที่ 1"
        channelLabel="Muse"
        score={7.35}
        genres={['Historical', 'Drama', 'Performing Arts']}
        progress={{ current: 1, total: 13 }}
        watchUrl="https://www.youtube.com/watch?v=sGFz693H8Kw"
        isFavorite={false}
        onToggleFavorite={() => {}}
        onSelect={() => {}}
      />
    </Stage>
  );
}

export function UpcomingNoLink() {
  return (
    <Stage style={{ width: 240 }}>
      <AnimeCard
        id="upcoming-example"
        titleThai="ตัวอย่างเรื่องที่ยังไม่ฉาย"
        titleOriginal="Upcoming Example"
        status="upcoming"
        updateStatus="no_playlist"
        latestText="ยังไม่เริ่มฉาย"
        channelLabel="รอช่องทางไทย"
        genres={['Action']}
        isFavorite={false}
        onToggleFavorite={() => {}}
        onSelect={() => {}}
      />
    </Stage>
  );
}
