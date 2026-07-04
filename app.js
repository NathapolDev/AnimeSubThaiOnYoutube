'use strict';
const data = window.ANIME_DATA || [];
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const NEW_EPISODE_WINDOW_MS = 48 * 60 * 60 * 1000;

// Bangkok "now" via formatToParts — parsing toLocaleString() output breaks on Safari
function bangkokNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    dayIndex: WEEKDAY_INDEX[get('weekday')] ?? now.getDay(),
    minutes: Number(get('hour')) * 60 + Number(get('minute'))
  };
}
const NOW = bangkokNow();
const currentYear = NOW.year;
const currentSeason = ['winter', 'spring', 'summer', 'fall'][Math.floor((NOW.month - 1) / 3)];

const tvYears = [...new Set(data.filter(item => item.jikanType === 'TV').map(item => Number(item.catalogYear || item.year)).filter(Boolean))].sort((a, b) => b - a);
let selectedYear = tvYears.includes(currentYear) ? currentYear : (tvYears[0] || currentYear);
let activeSeason = currentSeason;
let activeFilter = 'all', activeChannel = 'all', query = '', sortBy = 'updated', favoritesOnly = false;
let catalogLimit = 48;

const grid = document.querySelector('#grid');
const resultText = document.querySelector('#resultText');
const scheduleList = document.querySelector('#scheduleList');
const dialog = document.querySelector('#detailDialog');
const dialogContent = document.querySelector('#dialogContent');
const menuToggle = document.querySelector('#menuToggle');
const navMenu = document.querySelector('#navMenu');
const statusMap = { available: { label: 'ดูได้แล้ว', dot: 'green' }, upcoming: { label: 'รอเริ่มฉาย', dot: 'amber' } };
const updateMap = {
  ok: ['อัปเดตล่าสุด', 'update-ok'], no_episode_found: ['ยังไม่พบตอน', 'update-waiting'],
  no_playlist: ['ไม่มี Playlist', 'update-muted'], error: ['ตรวจสอบผิดพลาด', 'update-error'], pending: ['รอตรวจสอบ', 'update-muted']
};

// ---------- persistence ----------
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
};
const favorites = new Set(store.get('astyt:favorites', []));
function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  store.set('astyt:favorites', [...favorites]);
}

// ---------- helpers ----------
function normalize(value) { return (value || '').toString().toLowerCase().normalize('NFKC'); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function formatDateOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' }).format(date);
}
function posterThumb(url) { return String(url || '').replace(/l(\.(?:webp|jpe?g|png))$/i, '$1'); }
function posterHtml(item, { thumb = true, eager = false } = {}) {
  if (!item.poster) return '<span class="poster-fallback is-shown" aria-hidden="true">ไม่มีรูป</span>';
  const src = thumb ? posterThumb(item.poster) : item.poster;
  return `<img class="poster" src="${escapeHtml(src)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.hidden=true;this.parentElement.classList.add('is-missing')" /><span class="poster-fallback" aria-hidden="true">ไม่มีรูป</span>`;
}
function latestText(item) {
  if (Number(item.currentEpisode) > 0) return `ล่าสุด: ตอนที่ ${Number(item.currentEpisode)}`;
  if (!item.playlistId && !item.latestVideoUrl) return 'รอยืนยันช่องทางซับไทย';
  return item.status === 'upcoming' ? 'ยังไม่เริ่มฉาย' : 'รอตรวจสอบตอนล่าสุด';
}
function channelShort(channel) {
  const value = String(channel || '');
  if (value.includes('Ani-One')) return 'Ani-One';
  if (value.includes('Muse')) return 'Muse';
  if (value.includes('Tropics')) return 'Tropics';
  return value && !value.includes('ยังไม่') ? value : 'รอช่องทางไทย';
}
function hasNewEpisode(item) {
  const published = Date.parse(item.latestPublishedAt || '');
  return Number.isFinite(published) && Date.now() - published < NEW_EPISODE_WINDOW_MS;
}
function itemYear(item) { return Number(item.catalogYear || item.year || 0); }
function isTvInYear(item) { return item.jikanType === 'TV' && itemYear(item) === selectedYear; }
function isCurrentlyAiring(item) { return item.jikanStatus !== 'Finished Airing'; }
function isCurrentSeasonTv(item) { return item.jikanType === 'TV' && itemYear(item) === currentYear && item.season === currentSeason; }
function hasPremiered(item) { return !item.premiere || Date.parse(item.premiere) <= Date.now(); }
function isInCatalogScope(item) { return isTvInYear(item) && (activeSeason === 'all' || item.season === activeSeason); }
function isMatch(item) {
  if (!isInCatalogScope(item)) return false;
  if (favoritesOnly && !favorites.has(item.id)) return false;
  if (activeFilter !== 'all' && item.status !== activeFilter) return false;
  if (activeChannel !== 'all' && item.channel !== activeChannel) return false;
  if (!query) return true;
  const haystack = normalize([item.titleThai, item.titleOriginal, item.altTitle, item.channel, item.studio, item.source, ...(item.genres || [])].join(' '));
  return haystack.includes(normalize(query));
}
function parseAirTime(item) {
  const match = String(item.airTimeThai || '').match(/^(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)\s+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return { dayIndex: THAI_DAYS.indexOf(match[1]), minutes: Number(match[2]) * 60 + Number(match[3]), time: `${match[2].padStart(2, '0')}:${match[3]}` };
}
const sorters = {
  updated: (a, b) => (Date.parse(b.latestPublishedAt || '') || 0) - (Date.parse(a.latestPublishedAt || '') || 0),
  score: (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0),
  premiere: (a, b) => (Date.parse(a.premiere || '') || Infinity) - (Date.parse(b.premiere || '') || Infinity),
  title: (a, b) => String(a.titleThai || '').localeCompare(String(b.titleThai || ''), 'th')
};

// ---------- today panel ----------
function renderTodaySchedule() {
  const todayIndex = bangkokNow().dayIndex;
  const items = data
    .filter(item => isCurrentSeasonTv(item) && isCurrentlyAiring(item) && hasPremiered(item))
    .map(item => ({ item, air: parseAirTime(item) }))
    .filter(entry => entry.air && entry.air.dayIndex === todayIndex)
    .sort((a, b) => a.air.minutes - b.air.minutes);
  document.querySelector('#todayDate').textContent = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date());
  document.querySelector('#todayCount').textContent = `${items.length} เรื่อง`;
  document.querySelector('#todaySchedule').innerHTML = items.length ? items.map(({ item, air }) => `<button class="today-row" type="button" data-id="${escapeHtml(item.id)}">
    <span class="today-time">${air.time}</span><span class="today-thumb">${posterHtml(item)}</span>
    <span class="today-copy"><strong>${escapeHtml(item.titleThai)}</strong><small>${escapeHtml(channelShort(item.channel))}${hasNewEpisode(item) ? ' • มีตอนใหม่' : ''}</small></span><span class="today-detail">รายละเอียด</span>
  </button>`).join('') : '<div class="today-empty"><strong>วันนี้ยังไม่มีรายการที่ระบุเวลา</strong><span>ดูตารางทั้งสัปดาห์ได้ด้านล่าง</span></div>';
}

// ---------- stats ----------
function renderStats() {
  const scope = data.filter(item => item.jikanType === 'TV' && itemYear(item) === selectedYear);
  const available = scope.filter(item => item.status === 'available');
  const episodes = scope.reduce((sum, item) => sum + (Array.isArray(item.availableEpisodes) ? item.availableEpisodes.length : 0), 0);
  const newToday = scope.filter(hasNewEpisode).length;
  document.querySelector('#statsBar').innerHTML = [
    [scope.length, `อนิเมะ TV ปี ${selectedYear}`],
    [available.length, 'มีซับไทยให้ดู'],
    [episodes, 'ตอนที่รับชมได้'],
    [newToday, 'อัปเดตใน 48 ชม.']
  ].map(([value, label]) => `<div class="stat"><span>${value}</span><small>${label}</small></div>`).join('');
}

// ---------- catalog grid ----------
function cardTemplate(item, index) {
  const st = statusMap[item.status] || statusMap.upcoming;
  const update = updateMap[item.updateStatus] || updateMap.pending;
  const watchUrl = safeExternalUrl(item.latestVideoUrl || item.link);
  const hasWatch = watchUrl !== '#';
  const prog = episodeProgress(item);
  const isFav = favorites.has(item.id);
  return `<article class="anime-card" tabindex="0" role="button" aria-label="${escapeHtml(item.titleThai)}" data-id="${escapeHtml(item.id)}">
    <div class="poster-wrap">${posterHtml(item, { eager: index < 4 })}
      <div class="badges-top">
        <span class="badge status-badge"><span class="dot ${st.dot}"></span>${st.label}</span>
        ${hasNewEpisode(item) ? '<span class="badge new-badge">ตอนใหม่</span>' : ''}
      </div>
      <div class="badges-bottom">
        <span class="badge channel-badge">${escapeHtml(channelShort(item.channel))}</span>
        ${Number(item.score) > 0 ? `<span class="badge score-badge">★ ${Number(item.score).toFixed(2)}</span>` : ''}
      </div>
      <button class="fav-btn ${isFav ? 'is-fav' : ''}" type="button" data-fav="${escapeHtml(item.id)}" aria-pressed="${isFav}" aria-label="รายการโปรด">${isFav ? '★' : '☆'}</button>
    </div>
    <div class="card-body">
      <h3>${escapeHtml(item.titleThai)}</h3><p class="original">${escapeHtml(item.titleOriginal)}</p>
      <div class="episode-row"><strong>${latestText(item)}</strong><span class="update-badge ${update[1]}">${update[0]}</span></div>
      ${prog.show ? `<div class="progress" role="img" aria-label="พบตอนจาก YouTube ${prog.current} จาก ${prog.total} ตอน"><i style="width:${prog.percent}%"></i><span>${prog.current}/${prog.total}</span></div>` : ''}
      <div class="meta">${(item.genres || []).slice(0, 3).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
      <div class="card-footer">
        ${hasWatch ? `<a class="watch-btn" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener">▶ ${item.latestVideoUrl || item.playlistId ? 'ดูตอนล่าสุด' : 'ดูข้อมูลอนิเมะ'}</a>` : '<span class="watch-btn is-disabled">รอลิงก์รับชม</span>'}
        <span class="detail-btn">รายละเอียด →</span>
      </div>
    </div></article>`;
}
function render() {
  const items = data.filter(isMatch).sort(sorters[sortBy] || sorters.updated);
  const scopeTotal = data.filter(isInCatalogScope).length;
  const visibleItems = items.slice(0, catalogLimit);
  grid.innerHTML = visibleItems.map(cardTemplate).join('') || `<div class="glass data-note"><h2>ไม่พบรายการ</h2><p>ลองเปลี่ยนคำค้นหรือเลือกตัวกรอง “ทั้งหมด”</p></div>`;
  resultText.textContent = favoritesOnly ? `รายการโปรด ${items.length} เรื่อง` : `พบ ${items.length} จาก ${scopeTotal} รายการ`;
  const loadMore = document.querySelector('#loadMoreCatalog');
  loadMore.hidden = visibleItems.length >= items.length;
  loadMore.textContent = `แสดงรายการเพิ่ม (เหลืออีก ${items.length - visibleItems.length} รายการ)`;
}

// ---------- weekly schedule ----------
function renderSchedule() {
  const todayIndex = bangkokNow().dayIndex;
  const airing = data.filter(item => isInCatalogScope(item) && isCurrentlyAiring(item) && hasPremiered(item));
  const byDay = new Map();
  const unscheduled = [];
  for (const item of airing) {
    const air = parseAirTime(item);
    if (air) {
      const list = byDay.get(air.dayIndex) || [];
      list.push({ item, air });
      byDay.set(air.dayIndex, list);
    } else {
      unscheduled.push(item);
    }
  }
  const dayOrder = Array.from({ length: 7 }, (_, offset) => (todayIndex + offset) % 7);
  const sections = dayOrder
    .filter(dayIndex => byDay.has(dayIndex))
    .map(dayIndex => {
      const rows = byDay.get(dayIndex).sort((a, b) => a.air.minutes - b.air.minutes)
        .map(({ item, air }) => `<button class="schedule-item" type="button" data-id="${escapeHtml(item.id)}">
          <span class="schedule-time">${air.time}</span>
          <span class="schedule-copy"><strong>${escapeHtml(item.titleThai)}</strong><span>${escapeHtml(channelShort(item.channel))} • ${latestText(item)}</span></span>
        </button>`).join('');
      return `<section class="schedule-day ${dayIndex === todayIndex ? 'is-today' : ''}">
        <h3>วัน${THAI_DAYS[dayIndex]}${dayIndex === todayIndex ? ' <span class="today-tag">วันนี้</span>' : ''}</h3>
        <div class="schedule-rows">${rows}</div>
      </section>`;
    });
  if (unscheduled.length) {
    sections.push(`<section class="schedule-day is-unscheduled"><h3>รอประกาศเวลาไทย</h3><div class="schedule-rows">${unscheduled
      .sort((a, b) => String(a.titleThai).localeCompare(String(b.titleThai), 'th'))
      .map(item => `<button class="schedule-item" type="button" data-id="${escapeHtml(item.id)}">
        <span class="schedule-time">—</span>
        <span class="schedule-copy"><strong>${escapeHtml(item.titleThai)}</strong><span>${escapeHtml(channelShort(item.channel))} • ${latestText(item)}</span></span>
      </button>`).join('')}</div></section>`);
  }
  scheduleList.innerHTML = sections.join('') || '<p class="schedule-empty">ไม่มีรายการออกอากาศในขอบเขตที่เลือก</p>';
}

// ---------- detail dialog ----------
function episodeRowsTemplate(episodes) {
  return episodes.map(episode => {
    const url = safeExternalUrl(episode.videoUrl);
    return `<article class="episode-item">
    <div class="episode-number">${episode.number !== null && episode.number !== undefined ? `ตอนที่ ${escapeHtml(episode.number)}` : 'ตอนพิเศษ'}</div>
    <div class="episode-copy"><strong>${escapeHtml(episode.title || 'ไม่มีชื่อตอน')}</strong><span>${formatDate(episode.publishedAt)}</span></div>
    ${url !== '#' ? `<a class="episode-watch" href="${escapeHtml(url)}" target="_blank" rel="noopener">รับชม</a>` : ''}
  </article>`;
  }).join('');
}
function renderEpisodeList(item, limit) {
  const container = document.querySelector('#episodeList');
  const loadMore = document.querySelector('#loadMoreEpisodes');
  if (!container) return;
  const episodes = Array.isArray(item.availableEpisodes) ? item.availableEpisodes : [];
  if (!episodes.length) {
    container.innerHTML = '<p class="episode-empty">ยังไม่มีรายการตอนจาก YouTube</p>';
    if (loadMore) loadMore.hidden = true;
    return;
  }
  container.innerHTML = episodeRowsTemplate(episodes.slice(0, limit));
  if (loadMore) {
    loadMore.hidden = limit >= episodes.length;
    loadMore.textContent = `ดูตอนเก่ากว่า (${episodes.length - Math.min(limit, episodes.length)} ตอน)`;
  }
}
function showDetail(id, { updateHash = true } = {}) {
  const item = data.find(x => x.id === id);
  if (!item) return;
  const st = statusMap[item.status] || statusMap.upcoming;
  const watchUrl = safeExternalUrl(item.latestVideoUrl || item.link);
  const malUrl = safeExternalUrl(item.malUrl);
  const trailerUrl = safeExternalUrl(item.trailerUrl);
  const playlistUrl = item.playlistId ? safeExternalUrl(`https://www.youtube.com/playlist?list=${item.playlistId}`) : '#';
  const isFav = favorites.has(item.id);
  dialogContent.innerHTML = `<div class="dialog-grid"><div class="dialog-poster">${posterHtml(item, { thumb: false })}</div><div class="dialog-copy">
    <p class="eyebrow">${escapeHtml(item.channel)} • ${escapeHtml(item.platform)}</p><h2>${escapeHtml(item.titleThai)}</h2>
    <p class="original">${escapeHtml(item.titleOriginal)}${item.altTitle ? `<br>${escapeHtml(item.altTitle)}` : ''}</p><p>${escapeHtml(item.summary)}</p>
    <div class="meta">${(item.genres || []).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
    <div class="info-grid">
      <div class="info"><small>สถานะ</small><strong><span class="dot ${st.dot}"></span> ${st.label}</strong></div>
      <div class="info"><small>ตอนล่าสุด</small><strong>${Number(item.currentEpisode) > 0 ? `ตอนที่ ${Number(item.currentEpisode)}${Number(item.episodes) > 0 ? ` / ${Number(item.episodes)}` : ''}` : '—'}</strong></div>
      <div class="info"><small>เริ่มฉาย</small><strong>${formatDateOnly(item.premiere)}</strong></div>
      <div class="info"><small>เวลาฉาย (ไทย)</small><strong>${escapeHtml(item.airTimeThai || '—')}</strong></div>
      <div class="info"><small>สตูดิโอ</small><strong>${escapeHtml(item.studio || '—')}</strong></div>
      <div class="info"><small>คะแนน MAL</small><strong>${Number(item.score) > 0 ? `★ ${Number(item.score).toFixed(2)}` : '—'}</strong></div>
      <div class="info"><small>เผยแพร่ตอนล่าสุด</small><strong>${formatDate(item.latestPublishedAt)}</strong></div>
      <div class="info"><small>ตรวจสอบล่าสุด</small><strong>${formatDate(item.lastCheckedAt)}</strong></div>
    </div>${item.updateError ? `<p class="update-error-text">${escapeHtml(item.updateError)}</p>` : ''}
    <section class="episode-section" aria-labelledby="episodeHeading">
      <div class="episode-heading"><div><p class="eyebrow">YouTube Episodes</p><h3 id="episodeHeading">ตอนที่รับชมได้</h3></div><span>${Array.isArray(item.availableEpisodes) ? item.availableEpisodes.length : 0} ตอน</span></div>
      <div id="episodeList" class="episode-list"></div>
      <button id="loadMoreEpisodes" class="load-more-btn" type="button" hidden>ดูตอนเก่ากว่า</button>
    </section>
    <div class="dialog-actions">
      ${watchUrl !== '#' ? `<a class="primary-btn" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener">${item.latestVideoUrl || item.playlistId ? '▶ ดูตอนล่าสุด' : 'ดูข้อมูลอนิเมะ'}</a>` : ''}
      ${playlistUrl !== '#' ? `<a class="secondary-btn" href="${escapeHtml(playlistUrl)}" target="_blank" rel="noopener">Playlist ทั้งหมด</a>` : ''}
      ${trailerUrl !== '#' ? `<a class="secondary-btn" href="${escapeHtml(trailerUrl)}" target="_blank" rel="noopener">ตัวอย่าง</a>` : ''}
      ${malUrl !== '#' ? `<a class="secondary-btn" href="${escapeHtml(malUrl)}" target="_blank" rel="noopener">MyAnimeList</a>` : ''}
      <button class="secondary-btn fav-toggle" type="button" data-fav="${escapeHtml(item.id)}" aria-pressed="${isFav}">${isFav ? '★ อยู่ในรายการโปรด' : '☆ เพิ่มรายการโปรด'}</button>
      <button class="secondary-btn share-btn" type="button" data-share="${escapeHtml(item.id)}">🔗 คัดลอกลิงก์</button>
    </div>
  </div></div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  let episodeLimit = 10;
  renderEpisodeList(item, episodeLimit);
  document.querySelector('#loadMoreEpisodes')?.addEventListener('click', () => {
    episodeLimit += 10;
    renderEpisodeList(item, episodeLimit);
  });
  if (updateHash) history.replaceState(null, '', `#a=${encodeURIComponent(item.id)}`);
}
async function shareItem(id, button) {
  const url = `${location.origin}${location.pathname}#a=${encodeURIComponent(id)}`;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = '✓ คัดลอกแล้ว';
    setTimeout(() => { button.textContent = '🔗 คัดลอกลิงก์'; }, 1600);
  } catch {
    window.prompt('คัดลอกลิงก์นี้', url);
  }
}

// ---------- page identity + orchestration ----------
function updatePageIdentity() {
  document.querySelector('#brandTitle').textContent = `Anime TV ${selectedYear}`;
  document.title = `Anime TV ${selectedYear} — Thai YouTube Tracker`;
}
function renderCatalogViews() { updatePageIdentity(); renderStats(); renderTodaySchedule(); render(); renderSchedule(); }

// ---------- filters / controls ----------
const yearSelect = document.querySelector('#yearSelect');
yearSelect.innerHTML = tvYears.map(year => `<option value="${year}"${year === selectedYear ? ' selected' : ''}>${year}</option>`).join('');
yearSelect.addEventListener('change', event => { selectedYear = Number(event.target.value); catalogLimit = 48; renderCatalogViews(); });

document.querySelectorAll('[data-season]').forEach(chip => {
  chip.classList.toggle('active', chip.dataset.season === activeSeason);
  chip.addEventListener('click', () => {
    document.querySelectorAll('[data-season]').forEach(value => value.classList.remove('active'));
    chip.classList.add('active'); activeSeason = chip.dataset.season; catalogLimit = 48; renderCatalogViews();
  });
});
document.querySelectorAll('.status-filters .chip[data-filter]').forEach(chip => chip.addEventListener('click', () => {
  document.querySelectorAll('.status-filters .chip[data-filter]').forEach(c => c.classList.remove('active'));
  chip.classList.add('active'); activeFilter = chip.dataset.filter; catalogLimit = 48; render();
}));
const favFilter = document.querySelector('#favFilter');
favFilter.addEventListener('click', () => {
  favoritesOnly = !favoritesOnly;
  favFilter.classList.toggle('active', favoritesOnly);
  favFilter.setAttribute('aria-pressed', String(favoritesOnly));
  catalogLimit = 48; render();
});

// channel chips generated from the data instead of a hardcoded list
const channelFilters = document.querySelector('.channel-filters');
const channels = [...new Set(data.filter(item => item.jikanType === 'TV' && item.channel && !item.channel.includes('ยังไม่')).map(item => item.channel))].sort();
channelFilters.insertAdjacentHTML('beforeend',
  `<button class="chip active" type="button" data-channel="all">ทุกช่องทาง</button>` +
  channels.map(channel => `<button class="chip" type="button" data-channel="${escapeHtml(channel)}">${escapeHtml(channel)}</button>`).join(''));
channelFilters.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  channelFilters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active'); activeChannel = chip.dataset.channel; catalogLimit = 48; render();
}));

document.querySelector('#sortSelect').addEventListener('change', event => { sortBy = event.target.value; catalogLimit = 48; render(); });

let searchTimer = 0;
document.querySelector('#searchInput').addEventListener('input', event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = event.target.value; catalogLimit = 48; render(); }, 150);
});
document.querySelector('#loadMoreCatalog').addEventListener('click', () => { catalogLimit += 48; render(); });

// ---------- event delegation ----------
function handleActivation(event) {
  const favButton = event.target.closest('[data-fav]');
  if (favButton) {
    const id = favButton.dataset.fav;
    toggleFavorite(id);
    const isFav = favorites.has(id);
    document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach(button => {
      button.setAttribute('aria-pressed', String(isFav));
      if (button.classList.contains('fav-btn')) { button.classList.toggle('is-fav', isFav); button.textContent = isFav ? '★' : '☆'; }
      else button.textContent = isFav ? '★ อยู่ในรายการโปรด' : '☆ เพิ่มรายการโปรด';
    });
    if (favoritesOnly) render();
    return true;
  }
  const shareButton = event.target.closest('[data-share]');
  if (shareButton) { shareItem(shareButton.dataset.share, shareButton); return true; }
  if (event.target.closest('a')) return true;
  const card = event.target.closest('[data-id]');
  if (card) { showDetail(card.dataset.id); return true; }
  return false;
}
document.addEventListener('click', event => { handleActivation(event); });
grid.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.classList.contains('anime-card')) showDetail(event.target.dataset.id);
});

// ---------- dialog ----------
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => {
  if (location.hash.startsWith('#a=')) history.replaceState(null, '', location.pathname + location.search);
});

// ---------- theme (persisted; follows system preference by default) ----------
const themeToggle = document.querySelector('#themeToggle');
function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f7ff' : '#0a0d1d');
}
const storedTheme = store.get('astyt:theme', null);
applyTheme(storedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
themeToggle.addEventListener('click', () => {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  applyTheme(next);
  store.set('astyt:theme', next);
});

// ---------- mobile menu ----------
function closeMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
  navMenu.classList.remove('is-open');
}
menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  navMenu.classList.toggle('is-open', !isOpen);
});
navMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
window.addEventListener('resize', () => { if (window.innerWidth >= 600) closeMenu(); });

// ---------- boot ----------
renderCatalogViews();
const deepLink = location.hash.match(/^#a=(.+)$/);
if (deepLink) showDetail(decodeURIComponent(deepLink[1]), { updateHash: false });
