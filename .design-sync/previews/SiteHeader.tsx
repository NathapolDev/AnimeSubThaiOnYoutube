import { useState } from 'react';
import { SiteHeader } from 'anime-tv-design-system';
import { Stage } from './_shared';

const NAV_LINKS = [
  { href: '#catalog', label: 'แคตตาล็อก' },
  { href: '#schedule', label: 'ตารางฉาย' },
];

/** Site header with the mobile menu closed, dark theme. */
export function DefaultHeader() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  return (
    <Stage style={{ width: 640, padding: 0 }}>
      <SiteHeader
        brandTitle="Anime TV 2026"
        navLinks={NAV_LINKS}
        menuOpen={false}
        onToggleMenu={() => {}}
        theme={theme}
        onToggleTheme={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
      />
    </Stage>
  );
}

/** Site header with the mobile nav menu expanded. */
export function ExpandedMenuHeader() {
  return (
    <Stage style={{ width: 640, padding: 0 }}>
      <SiteHeader
        brandTitle="Anime TV 2026"
        navLinks={NAV_LINKS}
        menuOpen
        onToggleMenu={() => {}}
        theme="dark"
        onToggleTheme={() => {}}
      />
    </Stage>
  );
}
