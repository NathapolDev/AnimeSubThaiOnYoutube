import { Dot } from '../primitives/Dot';
import { PrimaryButton } from '../primitives/PrimaryButton';
import { SecondaryButton } from '../primitives/SecondaryButton';
import { InfoGrid } from './InfoGrid';
import { EpisodeList, type EpisodeListProps } from './EpisodeList';
import type { AnimeStatus } from '../catalog/AnimeCard';

export interface DetailDialogProps {
  open: boolean;
  onClose: () => void;
  channel: string;
  platform: string;
  titleThai: string;
  titleOriginal: string;
  altTitle?: string;
  summary: string;
  genres: string[];
  posterUrl?: string;
  status: AnimeStatus;
  statusLabel: string;
  /** e.g. "ตอนที่ 12 / 24" or "—". */
  episodeLabel: string;
  premiereLabel: string;
  airTimeLabel: string;
  studioLabel: string;
  scoreLabel: string;
  latestPublishedLabel: string;
  lastCheckedLabel: string;
  updateErrorText?: string;
  episodes: EpisodeListProps;
  watchUrl?: string;
  watchLabel?: string;
  playlistUrl?: string;
  trailerUrl?: string;
  malUrl?: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  shareLabel?: string;
}

/** Full anime detail modal: poster, metadata grid, episode list, and action row. */
export function DetailDialog({
  open,
  onClose,
  channel,
  platform,
  titleThai,
  titleOriginal,
  altTitle,
  summary,
  genres,
  posterUrl,
  status,
  statusLabel,
  episodeLabel,
  premiereLabel,
  airTimeLabel,
  studioLabel,
  scoreLabel,
  latestPublishedLabel,
  lastCheckedLabel,
  updateErrorText,
  episodes,
  watchUrl,
  watchLabel = 'ดูตอนล่าสุด',
  playlistUrl,
  trailerUrl,
  malUrl,
  isFavorite,
  onToggleFavorite,
  onShare,
  shareLabel = '🔗 คัดลอกลิงก์',
}: DetailDialogProps) {
  return (
    <dialog open={open} className="detail-dialog" aria-label="รายละเอียดอนิเมะ">
      <button className="close-btn" aria-label="ปิดรายละเอียด" onClick={onClose}>
        ×
      </button>
      <div className="dialog-grid">
        <div className="dialog-poster">
          {posterUrl ? <img src={posterUrl} alt="" /> : null}
        </div>
        <div className="dialog-copy">
          <p className="eyebrow">
            {channel} • {platform}
          </p>
          <h2>{titleThai}</h2>
          <p className="original">
            {titleOriginal}
            {altTitle ? (
              <>
                <br />
                {altTitle}
              </>
            ) : null}
          </p>
          <p>{summary}</p>
          <div className="meta">
            {genres.map(genre => (
              <span className="tag" key={genre}>
                {genre}
              </span>
            ))}
          </div>
          <InfoGrid
            items={[
              {
                label: 'สถานะ',
                value: (
                  <>
                    <Dot color={status === 'available' ? 'green' : 'amber'} /> {statusLabel}
                  </>
                ),
              },
              { label: 'ตอนล่าสุด', value: episodeLabel },
              { label: 'เริ่มฉาย', value: premiereLabel },
              { label: 'เวลาฉาย (ไทย)', value: airTimeLabel },
              { label: 'สตูดิโอ', value: studioLabel },
              { label: 'คะแนน MAL', value: scoreLabel },
              { label: 'เผยแพร่ตอนล่าสุด', value: latestPublishedLabel },
              { label: 'ตรวจสอบล่าสุด', value: lastCheckedLabel },
            ]}
          />
          {updateErrorText ? <p className="update-error-text">{updateErrorText}</p> : null}
          <EpisodeList {...episodes} />
          <div className="dialog-actions">
            {watchUrl ? (
              <PrimaryButton href={watchUrl} target="_blank" rel="noopener">
                ▶ {watchLabel}
              </PrimaryButton>
            ) : null}
            {playlistUrl ? (
              <SecondaryButton href={playlistUrl} target="_blank" rel="noopener">
                Playlist ทั้งหมด
              </SecondaryButton>
            ) : null}
            {trailerUrl ? (
              <SecondaryButton href={trailerUrl} target="_blank" rel="noopener">
                ตัวอย่าง
              </SecondaryButton>
            ) : null}
            {malUrl ? (
              <SecondaryButton href={malUrl} target="_blank" rel="noopener">
                MyAnimeList
              </SecondaryButton>
            ) : null}
            <SecondaryButton as="button" className="fav-toggle" aria-pressed={isFavorite} onClick={onToggleFavorite}>
              {isFavorite ? '★ อยู่ในรายการโปรด' : '☆ เพิ่มรายการโปรด'}
            </SecondaryButton>
            <SecondaryButton as="button" className="share-btn" onClick={onShare}>
              {shareLabel}
            </SecondaryButton>
          </div>
        </div>
      </div>
    </dialog>
  );
}
