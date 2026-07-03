'use strict';

// Keep the card progress bar based on the number of YouTube episodes we actually detected.
// This avoids using franchise-wide episode numbers such as Re:Zero episode 77 against a
// season total such as 19 episodes.
(function () {
  let scheduled = false;

  function youtubeEpisodeCount(item) {
    return Array.isArray(item?.availableEpisodes) ? item.availableEpisodes.length : 0;
  }

  function buildProgressElement() {
    const progress = document.createElement('div');
    progress.className = 'progress';
    progress.setAttribute('role', 'img');
    progress.innerHTML = '<i></i><span></span>';
    return progress;
  }

  function updateCardProgress(card) {
    const item = (window.ANIME_DATA || []).find(entry => entry.id === card.dataset.id);
    const total = Number(item?.episodes);
    const current = youtubeEpisodeCount(item);
    const episodeRow = card.querySelector('.episode-row');
    let progress = card.querySelector('.progress');

    if (!Number.isFinite(total) || total <= 0 || current <= 0) {
      if (progress) progress.hidden = true;
      return;
    }

    if (!progress && episodeRow) {
      progress = buildProgressElement();
      episodeRow.insertAdjacentElement('afterend', progress);
    }
    if (!progress) return;

    const displayedCurrent = Math.min(current, total);
    const percent = Math.min(100, Math.round((displayedCurrent / total) * 100));

    progress.hidden = false;
    progress.removeAttribute('aria-hidden');
    progress.setAttribute('aria-label', `พบตอนจาก YouTube ${displayedCurrent} จาก ${total} ตอน`);
    progress.querySelector('i').style.width = `${percent}%`;
    progress.querySelector('span').textContent = `${displayedCurrent}/${total}`;
  }

  function updateAllProgressBars(root = document) {
    if (root.matches?.('.anime-card')) updateCardProgress(root);
    root.querySelectorAll?.('.anime-card').forEach(updateCardProgress);
  }

  function scheduleUpdate(root = document) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateAllProgressBars(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleUpdate(), { once: true });
  } else {
    scheduleUpdate();
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.anime-card') || node.querySelector?.('.anime-card'))) {
          scheduleUpdate(node);
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
