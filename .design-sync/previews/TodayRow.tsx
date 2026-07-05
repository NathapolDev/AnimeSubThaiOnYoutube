import { TodayRow } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function Default() {
  return (
    <Stage style={{ width: 480 }}>
      <TodayRow
        id="world-is-dancing"
        time="20:30"
        posterUrl="https://cdn.myanimelist.net/images/anime/1165/158709l.webp"
        titleThai="The World Is Dancing"
        latestText="ล่าสุด: ตอนที่ 1"
        hasNewEpisode
        channel="Muse"
        onSelect={() => {}}
      />
    </Stage>
  );
}
