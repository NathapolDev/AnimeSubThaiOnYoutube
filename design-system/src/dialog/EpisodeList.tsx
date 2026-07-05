import type { EpisodeItemProps } from './EpisodeItem';
import { EpisodeItem } from './EpisodeItem';

export interface EpisodeListProps {
  episodeCount: number;
  episodes: EpisodeItemProps[];
  /** Whether more episodes exist beyond the ones currently shown. */
  hasMore?: boolean;
  remainingCount?: number;
  onLoadMore?: () => void;
}

/** Episode list section of the detail dialog, with a "load more" affordance. */
export function EpisodeList({ episodeCount, episodes, hasMore, remainingCount = 0, onLoadMore }: EpisodeListProps) {
  return (
    <section className="episode-section" aria-labelledby="episodeHeading">
      <div className="episode-heading">
        <div>
          <p className="eyebrow">YouTube Episodes</p>
          <h3 id="episodeHeading">ตอนที่รับชมได้</h3>
        </div>
        <span>{episodeCount} ตอน</span>
      </div>
      <div className="episode-list">
        {episodes.length ? (
          episodes.map((episode, index) => <EpisodeItem key={`${episode.episodeLabel}-${index}`} {...episode} />)
        ) : (
          <p className="episode-empty">ยังไม่มีรายการตอนจาก YouTube</p>
        )}
      </div>
      {hasMore ? (
        <button className="load-more-btn" type="button" onClick={onLoadMore}>
          ดูตอนเก่ากว่า ({remainingCount} ตอน)
        </button>
      ) : null}
    </section>
  );
}
