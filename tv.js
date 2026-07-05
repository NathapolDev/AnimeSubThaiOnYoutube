'use strict';
// TV mode: 10-foot UI + D-pad navigation for smart-TV browsers (Google TV,
// Android TV, Fire TV, Tizen, webOS, ...). Everything is gated behind the
// `tv-mode` class on <body>, so phones/tablets/desktops are untouched.
(() => {
  const TV_MODE_KEY = 'astyt:tvMode';
  const TV_UA = /\b(android ?tv|smart-?tv|googletv|crkey|aft[a-z0-9]{0,4}|bravia|tizen|web0s|netcast|hbbtv|viera|roku|tv bro)\b/i;

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
  };

  // Resolution order: URL param (also persisted) > stored preference > UA sniff.
  function resolveTvMode() {
    const param = new URLSearchParams(location.search).get('tv');
    if (param === '1' || param === '0') {
      storage.set(TV_MODE_KEY, param === '1' ? 'on' : 'off');
      return param === '1';
    }
    const stored = storage.get(TV_MODE_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
    return TV_UA.test(navigator.userAgent);
  }

  const tvToggle = document.querySelector('#tvToggle');
  function applyTvMode(enabled) {
    document.body.classList.toggle('tv-mode', enabled);
    tvToggle?.setAttribute('aria-pressed', String(enabled));
  }
  applyTvMode(resolveTvMode());
  tvToggle?.addEventListener('click', () => {
    const next = !document.body.classList.contains('tv-mode');
    applyTvMode(next);
    storage.set(TV_MODE_KEY, next ? 'on' : 'off');
  });

  // ---------- D-pad spatial navigation ----------
  const dialog = document.querySelector('#detailDialog');
  const FOCUSABLE = 'a[href], button:not([disabled]), input, select, [tabindex="0"]';

  function focusableCandidates() {
    const scope = dialog?.open ? dialog : document;
    return [...scope.querySelectorAll(FOCUSABLE)].filter(el => {
      if (el.closest('[hidden]')) return false;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      // Skip elements parked off-screen horizontally (e.g. the skip-link);
      // vertical off-screen stays valid — the page scrolls there.
      if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
      return getComputedStyle(el).visibility !== 'hidden';
    });
  }

  function isTextInput(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }

  // Standard spatial-nav heuristic: candidates must lie in the pressed
  // direction; score = distance along that axis + a heavy penalty for
  // sideways offset, so straight-ahead neighbours win over diagonal ones.
  function findNext(fromRect, direction, candidates) {
    const from = { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 };
    let best = null;
    let bestScore = Infinity;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      let primary, secondary;
      if (direction === 'ArrowLeft') { primary = from.x - center.x; secondary = Math.abs(center.y - from.y); }
      else if (direction === 'ArrowRight') { primary = center.x - from.x; secondary = Math.abs(center.y - from.y); }
      else if (direction === 'ArrowUp') { primary = from.y - center.y; secondary = Math.abs(center.x - from.x); }
      else { primary = center.y - from.y; secondary = Math.abs(center.x - from.x); }
      if (primary <= 1) continue;
      const score = primary + secondary * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  function moveFocus(direction) {
    const active = document.activeElement;
    const candidates = focusableCandidates();
    let next;
    if (active && active !== document.body && candidates.includes(active)) {
      next = findNext(active.getBoundingClientRect(), direction, candidates.filter(el => el !== active));
    } else {
      // Nothing focused yet: start from the element nearest the top-left.
      next = candidates
        .map(el => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > 0)
        .sort((a, b) => (a.rect.top + a.rect.left * 0.2) - (b.rect.top + b.rect.left * 0.2))[0]?.el;
    }
    if (!next) return false;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'center', inline: 'nearest' });
    return true;
  }

  document.addEventListener('keydown', event => {
    if (!document.body.classList.contains('tv-mode') || event.defaultPrevented) return;

    // Remote "Back": close the detail dialog instead of leaving the page.
    if (event.key === 'Backspace' || event.key === 'GoBack' || event.key === 'BrowserBack') {
      if (isTextInput(event.target) && event.key === 'Backspace') return;
      if (dialog?.open) {
        event.preventDefault();
        dialog.close();
      }
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Keep native caret movement in text fields. <select> is NOT exempt:
    // arrows always navigate away, Enter opens its native picker instead
    // (otherwise the D-pad gets trapped cycling the select's options).
    if (isTextInput(event.target) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;

    if (moveFocus(event.key)) event.preventDefault();
  });
})();
