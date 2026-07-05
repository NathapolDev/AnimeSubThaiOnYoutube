import { EpisodeList } from 'anime-tv-design-system';
import { Stage } from './_shared';

export function WithEpisodesAndMore() {
  return (
    <Stage style={{ width: 460, background: '#041a2b' }}>
      <EpisodeList
        episodeCount={2}
        episodes={[
          {
            episodeLabel: 'ตอนที่ 2',
            title: 'The Cat and the Dragon ตอนที่ 2 [ซับไทย]【Ani-One Thailand】',
            publishedAtLabel: '3 ก.ค. 2569 17:17',
            watchUrl: 'https://www.youtube.com/watch?v=OpDLemm9U5Q',
          },
          {
            episodeLabel: 'ตอนที่ 1',
            title: 'The Cat and the Dragon ตอนที่ 1 [ซับไทย]【Ani-One Thailand】',
            publishedAtLabel: '27 มิ.ย. 2569 20:00',
            watchUrl: 'https://www.youtube.com/watch?v=2PbUt7g06TU',
          },
        ]}
        hasMore
        remainingCount={3}
        onLoadMore={() => {}}
      />
    </Stage>
  );
}

export function Empty() {
  return (
    <Stage style={{ width: 460, background: '#041a2b' }}>
      <EpisodeList episodeCount={0} episodes={[]} />
    </Stage>
  );
}
