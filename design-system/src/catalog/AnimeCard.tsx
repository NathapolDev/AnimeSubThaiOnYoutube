import { Badge } from '../primitives/Badge';
import { Dot } from '../primitives/Dot';
import { ProgressBar } from '../primitives/ProgressBar';

export type AnimeStatus = 'available' | 'upcoming';
export type UpdateStatus = 'ok' | 'no_episode_found' | 'no_playlist' | 'error' | 'pending';

const STATUS_LABEL: Record<AnimeStatus, { label: string; dot: 'green' | 'amber' }> = {
  available: { label: 'ดูได้แล้ว', dot: 'green' },
  upcoming: { label: 'รอเริ่มฉาย', dot: 'amber' },
};

const UPDATE_LABEL: Record<UpdateStatus, [string, string]> = {
  ok: ['อัปเดตล่าสุด', 'update-ok'],
  no_episode_found: ['ยังไม่พบตอน', 'update-waiting'],
  no_playlist: ['ไม่มี Playlist', 'update-muted'],
  error: ['ตรวจสอบผิดพลาด', 'update-error'],
  pending: ['รอตรวจสอบ', 'update-muted'],
};

export interface AnimeCardProps {
  id: string;
  titleThai: string;
  titleOriginal: string;
  posterUrl?: string;
  status: AnimeStatus;
  updateStatus: UpdateStatus;
  /** e.g. "ล่าสุด: ตอนที่ 12" — already formatted by the host page. */
  latestText: string;
  hasNewEpisode?: boolean;
  channelLabel: string;
  /** MyAnimeList score, when known and > 0. */
  score?: number;
  genres: string[];
  /** Fully-resolved watch URL, or undefined when there's nothing to link to yet. */
  watchUrl?: string;
  watchLabel?: string;
  progress?: { current: number; total: number };
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (id: string) => void;
  /** Loads the poster eagerly for above-the-fold cards. */
  eager?: boolean;
}

/** Catalog grid card: poster, status/new/channel/score badges, favorite toggle, and watch/detail actions. */
export function AnimeCard({
  id,
  titleThai,
  titleOriginal,
  posterUrl,
  status,
  updateStatus,
  latestText,
  hasNewEpisode,
  channelLabel,
  score,
  genres,
  watchUrl,
  watchLabel = 'ดูตอนล่าสุด',
  progress,
  isFavorite,
  onToggleFavorite,
  onSelect,
  eager = false,
}: AnimeCardProps) {
  const st = STATUS_LABEL[status];
  const update = UPDATE_LABEL[updateStatus];

  return (
    <article
      className="anime-card"
      tabIndex={0}
      role="button"
      aria-label={titleThai}
      onClick={() => onSelect(id)}
      onKeyDown={event => {
        if (event.key === 'Enter') onSelect(id);
      }}
    >
      <div className="poster-wrap">
        {posterUrl ? (
          <img
            className="poster"
            src={posterUrl}
            alt=""
            loading={eager ? undefined : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
            decoding="async"
          />
        ) : (
          <span className="poster-fallback is-shown" aria-hidden="true">
            ไม่มีรูป
          </span>
        )}
        <div className="badges-top">
          <Badge>
            <Dot color={st.dot} />
            {st.label}
          </Badge>
          {hasNewEpisode ? <Badge variant="new">ตอนใหม่</Badge> : null}
        </div>
        <div className="badges-bottom">
          <Badge variant="channel">{channelLabel}</Badge>
          {score && score > 0 ? <Badge variant="score">★ {score.toFixed(2)}</Badge> : null}
        </div>
        <button
          className={['fav-btn', isFavorite ? 'is-fav' : ''].filter(Boolean).join(' ')}
          type="button"
          aria-pressed={isFavorite}
          aria-label="รายการโปรด"
          onClick={event => {
            event.stopPropagation();
            onToggleFavorite(id);
          }}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </div>
      <div className="card-body">
        <h3>{titleThai}</h3>
        <p className="original">{titleOriginal}</p>
        <div className="episode-row">
          <strong>{latestText}</strong>
          <span className={['update-badge', update[1]].join(' ')}>{update[0]}</span>
        </div>
        {progress ? <ProgressBar current={progress.current} total={progress.total} /> : null}
        <div className="meta">
          {genres.slice(0, 3).map(genre => (
            <span className="tag" key={genre}>
              {genre}
            </span>
          ))}
        </div>
        <div className="card-footer">
          {watchUrl ? (
            <a className="watch-btn" href={watchUrl} target="_blank" rel="noopener" onClick={event => event.stopPropagation()}>
              ▶ {watchLabel}
            </a>
          ) : (
            <span className="watch-btn is-disabled">รอลิงก์รับชม</span>
          )}
          <span className="detail-btn">รายละเอียด →</span>
        </div>
      </div>
    </article>
  );
}
