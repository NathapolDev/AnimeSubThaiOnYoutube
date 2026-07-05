import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

export type SecondaryButtonProps =
  | ({ as?: 'a' } & AnchorHTMLAttributes<HTMLAnchorElement>)
  | ({ as: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>);

/** Outlined secondary action — dialog actions (playlist/trailer/MAL links) or toggle buttons (favorite/share). */
export function SecondaryButton(props: SecondaryButtonProps) {
  const { as = 'a', className, children, ...rest } = props as SecondaryButtonProps & { as?: 'a' | 'button' };
  const classes = ['secondary-btn', className].filter(Boolean).join(' ');
  if (as === 'button') {
    return (
      <button type="button" className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  }
  return (
    <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
      {children}
    </a>
  );
}
