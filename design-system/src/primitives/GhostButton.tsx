import type { ButtonHTMLAttributes } from 'react';

export type GhostButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Outlined pill button used for the theme toggle and mobile menu toggle. */
export function GhostButton({ className, children, ...rest }: GhostButtonProps) {
  return (
    <button type="button" className={['ghost-btn', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}
