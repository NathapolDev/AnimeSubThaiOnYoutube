import { useState } from 'react';
import { SiteHeader } from '../src';

const NAV_LINKS = [
  { href: '#catalog', label: 'แคตตาล็อก' },
  { href: '#schedule', label: 'ตารางฉาย' },
];

/** Site header with the mobile menu closed, dark theme. */
export function DefaultHeader() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  return (
    <SiteHeader
      brandTitle="Anime TV 2026"
      navLinks={NAV_LINKS}
      menuOpen={false}
      onToggleMenu={() => {}}
      theme={theme}
      onToggleTheme={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
    />
  );
}

/** Site header with the mobile nav menu expanded. */
export function ExpandedMenuHeader() {
  return (
    <SiteHeader
      brandTitle="Anime TV 2026"
      navLinks={NAV_LINKS}
      menuOpen
      onToggleMenu={() => {}}
      theme="dark"
      onToggleTheme={() => {}}
    />
  );
}
