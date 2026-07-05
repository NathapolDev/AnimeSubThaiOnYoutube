import type { ButtonHTMLAttributes } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the chip renders in its selected/active state. */
  active?: boolean;
  /** Renders the favorite-flavored chip variant (used for the "★ รายการโปรด" filter). */
  variant?: 'default' | 'favorite';
}

/** A pill-shaped filter/selection button, e.g. season, status, and channel filters. */
export function Chip({ active = false, variant = 'default', className, children, ...rest }: ChipProps) {
  const classes = ['chip', variant === 'favorite' ? 'chip-fav' : '', active ? 'active' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} aria-pressed={variant === 'favorite' ? active : undefined} {...rest}>
      {children}
    </button>
  );
}
