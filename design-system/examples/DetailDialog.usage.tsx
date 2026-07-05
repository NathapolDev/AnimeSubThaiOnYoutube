import { useState } from 'react';
import { DetailDialog } from '../src';

/** Detail dialog open on a title with episodes, all metadata, and full action row. */
export function OpenDialog() {
  const [isFavorite, setIsFavorite] = useState(false);
  return (
    <DetailDialog
      open
      onClose={() => {}}
      channel="Ani-One Thailand"
      platform="YouTube"
      titleThai="The Cat and the Dragon"
      titleOriginal="Neko to Ryuu"
      altTitle="แมวกับมังกร"
      summary="ลูกมังกรที่เติบโตมากับแม่แมวออกเดินทางเพื่อเข้าใจมนุษย์และหาทางอยู่ร่วมกันอย่างสงบ"
      genres={['Fantasy', 'Adventure', 'Animal']}
      posterUrl="https://cdn.myanimelist.net/images/anime/1878/157796l.webp"
      status="available"
      statusLabel="ดูได้แล้ว"
      episodeLabel="ตอนที่ 2"
      premiereLabel="27 มิถุนายน 2569"
      airTimeLabel="เสาร์ 20:00"
      studioLabel="OLM"
      scoreLabel="★ 7.55"
      latestPublishedLabel="3 ก.ค. 2569 17:17"
      lastCheckedLabel="5 ก.ค. 2569 09:00"
      episodes={{
        episodeCount: 2,
        episodes: [
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
        ],
        hasMore: false,
      }}
      watchUrl="https://www.youtube.com/watch?v=OpDLemm9U5Q"
      playlistUrl="https://www.youtube.com/playlist?list=PLYA5C3ueQ-1g"
      malUrl="https://myanimelist.net/anime/58971"
      isFavorite={isFavorite}
      onToggleFavorite={() => setIsFavorite(v => !v)}
      onShare={() => {}}
    />
  );
}

/** Detail dialog for a title with no YouTube episodes yet and an update error banner. */
export function EmptyEpisodesDialog() {
  return (
    <DetailDialog
      open
      onClose={() => {}}
      channel="ยังไม่มีช่องทางไทย"
      platform="—"
      titleThai="ตัวอย่างเรื่องที่ยังไม่ฉาย"
      titleOriginal="Upcoming Example"
      summary="เรื่องนี้ยังไม่พบช่องทางรับชมซับไทยอย่างเป็นทางการ"
      genres={['Action']}
      status="upcoming"
      statusLabel="รอเริ่มฉาย"
      episodeLabel="—"
      premiereLabel="กันยายน 2569"
      airTimeLabel="—"
      studioLabel="—"
      scoreLabel="—"
      latestPublishedLabel="—"
      lastCheckedLabel="5 ก.ค. 2569 09:00"
      updateErrorText="ตรวจสอบ Playlist ล้มเหลว: ไม่พบรหัสวิดีโอ"
      episodes={{ episodeCount: 0, episodes: [] }}
      isFavorite={false}
      onToggleFavorite={() => {}}
      onShare={() => {}}
    />
  );
}
