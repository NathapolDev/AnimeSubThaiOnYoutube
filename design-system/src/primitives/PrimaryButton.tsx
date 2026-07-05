import type { AnchorHTMLAttributes } from 'react';

export type PrimaryButtonProps = AnchorHTMLAttributes<HTMLAnchorElement>;

/** The gradient call-to-action link, e.g. "▶ ดูตอนล่าสุด" in the detail dialog and card footer. */
export function PrimaryButton({ className, children, ...rest }: PrimaryButtonProps) {
  return (
    <a className={['primary-btn', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </a>
  );
}
