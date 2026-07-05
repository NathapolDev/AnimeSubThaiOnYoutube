import { Badge } from 'anime-tv-design-system';

export function StatusAvailable() {
  return <Badge>ดูได้แล้ว</Badge>;
}

export function NewEpisode() {
  return <Badge variant="new">ตอนใหม่</Badge>;
}

export function Score() {
  return <Badge variant="score">★ 7.55</Badge>;
}

export function Channel() {
  return <Badge variant="channel">Ani-One Thailand</Badge>;
}
