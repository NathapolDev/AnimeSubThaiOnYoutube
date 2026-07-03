'use strict';

// Hide impossible episode progress values such as 77/19.
// Some YouTube playlists use cumulative episode numbers across a whole franchise,
// while Jikan/MAL episodes may represent only the selected season.
(function () {
  let scheduled = false;

  function parseProgressValue(text) {
    const match = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return null;
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total)) return null;
    return { current, total };
  }

  function fixProgressBars(root = document) {
    root.querySelectorAll?.('.progress').forEach(progress => {
      const value = parseProgressValue(progress.textContent);
      if (value && value.total > 0 && value.current > value.total) {
        progress.hidden = true;
        progress.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function scheduleFix(root = document) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fixProgressBars(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleFix(), { once: true });
  } else {
    scheduleFix();
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.progress') || node.querySelector?.('.progress'))) {
          scheduleFix(node);
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
