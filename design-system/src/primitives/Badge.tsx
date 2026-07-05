import type { ReactNode } from 'react';

export interface BadgeProps {
  /** Visual flavor: plain overlay badge, the accent "new episode" badge, or the MAL score badge. */
  variant?: 'default' | 'new' | 'score' | 'channel';
  children: ReactNode;
}

/** Small pill label overlaid on posters and cards (status, new-episode, channel, score). */
export function Badge({ variant = 'default', children }: BadgeProps) {
  const variantClass = { default: '', new: 'new-badge', score: 'score-badge', channel: 'channel-badge' }[variant];
  return <span className={['badge', variantClass].filter(Boolean).join(' ')}>{children}</span>;
}
