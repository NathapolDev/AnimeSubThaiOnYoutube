import { EpisodeItem } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function WithWatchLink() {
  return (
    <Stage style={{ width: 460, background: '#041a2b' }}>
      <EpisodeItem
        episodeLabel="ตอนที่ 2"
        title="The Cat and the Dragon ตอนที่ 2 [ซับไทย]【Ani-One Thailand】"
        publishedAtLabel="3 ก.ค. 2569 17:17"
        watchUrl="https://www.youtube.com/watch?v=OpDLemm9U5Q"
      />
    </Stage>
  );
}

export function SpecialNoLink() {
  return (
    <Stage style={{ width: 460, background: '#041a2b' }}>
      <EpisodeItem episodeLabel="ตอนพิเศษ" title="ไม่มีชื่อตอน" publishedAtLabel="—" />
    </Stage>
  );
}
