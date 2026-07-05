import { GhostButton } from '../primitives/GhostButton';

export interface NavLink {
  href: string;
  label: string;
}

export interface SiteHeaderProps {
  /** e.g. "Anime TV 2026" — kept in sync with the selected catalog year by the host page. */
  brandTitle: string;
  navLinks: NavLink[];
  /** Whether the mobile nav menu is expanded. Controlled by the host page. */
  menuOpen: boolean;
  onToggleMenu: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

/** Top site navigation: brand mark, section links, theme toggle, and mobile menu. */
export function SiteHeader({ brandTitle, navLinks, menuOpen, onToggleMenu, theme, onToggleTheme }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <nav className="nav">
        <a className="brand" href="#top" aria-label="Anime TV Catalog home">
          <span className="brand-mark">夏</span>
          <span>{brandTitle}</span>
          <small>番組表</small>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="navMenu"
          onClick={onToggleMenu}
        >
          เมนู
        </button>
        <div id="navMenu" className={['nav-actions', menuOpen ? 'is-open' : ''].filter(Boolean).join(' ')}>
          {navLinks.map(link => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <GhostButton aria-label="สลับธีมสี" onClick={onToggleTheme}>
            {theme === 'light' ? '☀️' : '🌙'}
          </GhostButton>
        </div>
      </nav>
    </header>
  );
}
