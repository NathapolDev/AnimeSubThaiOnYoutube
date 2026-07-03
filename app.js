const data = window.ANIME_DATA || [];
const currentBangkokDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
const currentYear = currentBangkokDate.getFullYear();
const currentSeason = ['winter', 'spring', 'summer', 'fall'][Math.floor(currentBangkokDate.getMonth() / 3)];
const tvYears = [...new Set(data.filter(item => item.jikanType === 'TV').map(item => Number(item.catalogYear || item.year)).filter(Boolean))].sort((a, b) => b - a);
let selectedYear = tvYears.includes(currentYear) ? currentYear : (tvYears[0] || currentYear);
let activeSeason = currentSeason;
let activeFilter = 'all', query = '';
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

function normalize(value) { return (value || '').toString().toLowerCase().normalize('NFKC'); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function latestText(item) {
  if (Number(item.currentEpisode) > 0) return `ล่าสุด: ตอนที่ ${item.currentEpisode}`;
  if (!item.playlistId) return 'รอยืนยันช่องทางซับไทย';
  return item.status === 'upcoming' ? 'ยังไม่เริ่มฉาย' : 'รอตรวจสอบตอนล่าสุด';
}
function itemYear(item) { return Number(item.catalogYear || item.year || 0); }
function isTvInYear(item) { return item.jikanType === 'TV' && itemYear(item) === selectedYear; }
function isCurrentlyAiring(item) { return item.jikanStatus !== 'Finished Airing'; }
function isCurrentSeasonTv(item) { return item.jikanType === 'TV' && itemYear(item) === currentYear && item.season === currentSeason; }
function hasPremiered(item) { return !item.premiere || new Date(item.premiere) <= currentBangkokDate; }
function isInCatalogScope(item) { return isTvInYear(item) && (activeSeason === 'all' || item.season === activeSeason); }
function isMatch(item) {
  const haystack = normalize([item.titleThai, item.titleOriginal, item.altTitle, item.channel, item.studio, item.source, ...(item.genres || [])].join(' '));
  return isInCatalogScope(item) && (!query || haystack.includes(normalize(query))) && (activeFilter === 'all' || item.status === activeFilter || item.channel === activeFilter);
}
function thaiToday() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('th-TH', { weekday: 'long', timeZone: 'Asia/Bangkok' }).format(now).replace(/^วัน/, '');
  const date = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(now);
  return { weekday, date };
}
function scheduleTimeForDay(item, weekday) {
  const match = String(item.airTimeThai || '').match(new RegExp(`${weekday}\\s+(\\d{1,2}:\\d{2})`));
  return match ? match[1] : '';
}
function renderTodaySchedule() {
  const { weekday, date } = thaiToday();
  const items = data.filter(item => isCurrentSeasonTv(item) && isCurrentlyAiring(item) && hasPremiered(item))
    .map(item => ({ item, time: scheduleTimeForDay(item, weekday) }))
    .filter(entry => entry.time)
    .sort((a, b) => a.time.localeCompare(b.time, 'th'));
  document.querySelector('#todayDate').textContent = date;
  document.querySelector('#todayCount').textContent = `${items.length} เรื่อง`;
  const container = document.querySelector('#todaySchedule');
  container.innerHTML = items.length ? items.map(({ item, time }) => `<button class="today-row" type="button" data-id="${escapeHtml(item.id)}">
    <span class="today-time">${escapeHtml(time)}</span><img src="${escapeHtml(item.poster)}" alt="" loading="lazy" />
    <span class="today-copy"><strong>${escapeHtml(item.titleThai)}</strong><small>${escapeHtml(item.channel)}</small></span><span class="today-detail">รายละเอียด</span>
  </button>`).join('') : `<div class="today-empty"><strong>วันนี้ยังไม่มีรายการที่ระบุเวลา</strong><span>ตรวจสอบตารางวันอื่นได้ด้านล่าง</span></div>`;
  container.querySelectorAll('.today-row').forEach(row => row.addEventListener('click', () => showDetail(row.dataset.id)));
}
function cardTemplate(item) {
  const st = statusMap[item.status] || statusMap.upcoming;
  const update = updateMap[item.updateStatus] || updateMap.pending;
  const watchUrl = safeExternalUrl(item.latestVideoUrl || item.link);
  return `<article class="anime-card" tabindex="0" data-id="${escapeHtml(item.id)}">
    <div class="poster-wrap"><img class="poster" src="${escapeHtml(item.poster)}" alt="${escapeHtml(item.titleThai)}" loading="lazy" onerror="this.hidden=true;this.parentElement.classList.add('is-missing')" /><span class="poster-fallback" aria-hidden="true">ไม่มีรูป</span></div>
    <div class="status"><span class="dot ${st.dot}"></span>${st.label}</div><div class="channel">${item.channel.includes('Ani') ? 'Ani-One' : item.channel.includes('Muse') ? 'Muse' : 'รอช่องทางไทย'}</div>
    <div class="card-body"><h3>${escapeHtml(item.titleThai)}</h3><p class="original">${escapeHtml(item.titleOriginal)}</p>
      <div class="episode-row"><strong>${latestText(item)}</strong><span class="update-badge ${update[1]}">${update[0]}</span></div>
      ${item.lastCheckedAt ? `<p class="checked-at">ตรวจสอบล่าสุด ${formatDate(item.lastCheckedAt)}</p>` : ''}
      <p class="summary">${escapeHtml(item.summary)}</p><div class="meta">${(item.genres || []).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
      <div class="card-footer"><a class="watch-btn" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ ${item.latestVideoUrl || item.playlistId ? 'ดูตอนล่าสุด' : 'ดูข้อมูลอนิเมะ'}</a><span class="detail-btn">รายละเอียด →</span></div>
    </div></article>`;
}
function render() {
  const items = data.filter(isMatch);
  const scopeTotal = data.filter(isInCatalogScope).length;
  const visibleItems = items.slice(0, catalogLimit);
  grid.innerHTML = visibleItems.map(cardTemplate).join('') || `<div class="glass data-note"><h2>ไม่พบรายการ</h2><p>ลองเปลี่ยนคำค้นหรือเลือกตัวกรอง “ทั้งหมด”</p></div>`;
  resultText.textContent = `พบ ${items.length} จาก ${scopeTotal} รายการ`;
  const loadMore = document.querySelector('#loadMoreCatalog');
  loadMore.hidden = visibleItems.length >= items.length;
  loadMore.textContent = `แสดงรายการเพิ่ม (${items.length - visibleItems.length} รายการ)`;
  document.querySelectorAll('.anime-card').forEach(card => {
    const open = () => showDetail(card.dataset.id);
    card.addEventListener('click', open); card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
}
function renderSchedule() {
  const sorted = data.filter(item => isInCatalogScope(item) && isCurrentlyAiring(item)).sort((a, b) => a.airTimeThai.localeCompare(b.airTimeThai, 'th'));
  scheduleList.innerHTML = sorted.map(item => `<div class="schedule-item"><div class="schedule-date">${escapeHtml(item.airTimeThai.split(' ')[0])}</div><div><strong>${escapeHtml(item.titleThai)}</strong><span>${escapeHtml(item.airTimeThai)} • ${escapeHtml(item.channel)} • ${latestText(item)}</span></div></div>`).join('');
}
function episodeRowsTemplate(episodes) {
  return episodes.map(episode => `<article class="episode-item">
    <div class="episode-number">${episode.number !== null && episode.number !== undefined ? `ตอนที่ ${escapeHtml(episode.number)}` : 'ตอนพิเศษ'}</div>
    <div class="episode-copy"><strong>${escapeHtml(episode.title || 'ไม่มีชื่อตอน')}</strong><span>${formatDate(episode.publishedAt)}</span></div>
    <a class="episode-watch" href="${escapeHtml(safeExternalUrl(episode.videoUrl))}" target="_blank" rel="noopener">รับชม</a>
  </article>`).join('');
}
function renderEpisodeList(item, limit) {
  const container = document.querySelector('#episodeList');
  const loadMore = document.querySelector('#loadMoreEpisodes');
  if (!container) return;
  const episodes = Array.isArray(item.availableEpisodes) ? item.availableEpisodes : [];
  if (!episodes.length) {
    container.innerHTML = `<p class="episode-empty">${item.playlistId ? 'ยังไม่พบรายการตอนจาก YouTube' : 'ยังไม่มีรายการตอนจาก YouTube'}</p>`;
    if (loadMore) loadMore.hidden = true;
    return;
  }
  container.innerHTML = episodeRowsTemplate(episodes.slice(0, limit));
  if (loadMore) {
    loadMore.hidden = limit >= episodes.length;
    loadMore.textContent = `ดูตอนเก่ากว่า (${episodes.length - Math.min(limit, episodes.length)} ตอน)`;
  }
}
function showDetail(id) {
  const item = data.find(x => x.id === id); if (!item) return;
  const st = statusMap[item.status] || statusMap.upcoming;
  const watchUrl = safeExternalUrl(item.latestVideoUrl || item.link);
  dialogContent.innerHTML = `<div class="dialog-grid"><div class="dialog-poster"><img src="${escapeHtml(item.poster)}" alt="${escapeHtml(item.titleThai)}" onerror="this.hidden=true;this.parentElement.classList.add('is-missing')" /><span class="poster-fallback" aria-hidden="true">ไม่มีรูป</span></div><div class="dialog-copy">
    <p class="eyebrow">${escapeHtml(item.channel)} • ${escapeHtml(item.platform)}</p><h2>${escapeHtml(item.titleThai)}</h2>
    <p class="original">${escapeHtml(item.titleOriginal)}<br>${escapeHtml(item.altTitle)}</p><p>${escapeHtml(item.summary)}</p>
    <div class="meta">${(item.genres || []).map(g => `<span class="tag">${escapeHtml(g)}</span>`).join('')}</div><div class="info-grid">
      <div class="info"><small>สถานะ</small><strong><span class="dot ${st.dot}"></span> ${st.label}</strong></div>
      <div class="info"><small>ตอนล่าสุด</small><strong>${Number(item.currentEpisode) > 0 ? `ตอนที่ ${item.currentEpisode}` : '—'}</strong></div>
      <div class="info"><small>ชื่อตอนล่าสุด</small><strong>${escapeHtml(item.latestEpisodeTitle || '—')}</strong></div>
      <div class="info"><small>เผยแพร่เมื่อ</small><strong>${formatDate(item.latestPublishedAt)}</strong></div>
      <div class="info"><small>ตรวจสอบล่าสุด</small><strong>${formatDate(item.lastCheckedAt)}</strong></div>
      <div class="info"><small>ความมั่นใจ</small><strong>${escapeHtml(item.confidence || '—')}</strong></div>
    </div>${item.updateError ? `<p class="update-error-text">${escapeHtml(item.updateError)}</p>` : ''}
    <section class="episode-section" aria-labelledby="episodeHeading">
      <div class="episode-heading"><div><p class="eyebrow">YouTube Episodes</p><h3 id="episodeHeading">ตอนที่รับชมได้</h3></div><span>${Array.isArray(item.availableEpisodes) ? item.availableEpisodes.length : 0} ตอน</span></div>
      <div id="episodeList" class="episode-list"></div>
      <button id="loadMoreEpisodes" class="load-more-btn" type="button" hidden>ดูตอนเก่ากว่า</button>
    </section>
    <div class="dialog-actions"><a class="primary-btn" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener">${item.latestVideoUrl || item.playlistId ? 'ดูตอนล่าสุด' : 'ดูข้อมูลบน MyAnimeList'}</a>${item.playlistId ? `<a class="secondary-btn" href="${escapeHtml(safeExternalUrl(item.link || watchUrl))}" target="_blank" rel="noopener">Playlist / YouTube</a>` : ''}</div>
  </div></div>`;
  dialog.showModal();
  let episodeLimit = 10;
  renderEpisodeList(item, episodeLimit);
  document.querySelector('#loadMoreEpisodes')?.addEventListener('click', () => {
    episodeLimit += 10;
    renderEpisodeList(item, episodeLimit);
  });
}
document.querySelector('#searchInput').addEventListener('input', e => { query = e.target.value; catalogLimit = 48; render(); });
function updatePageIdentity() {
  document.querySelector('#brandTitle').textContent = `Anime TV ${selectedYear}`;
  document.title = `Anime TV ${selectedYear} — Thai YouTube Tracker`;
}
function renderCatalogViews() { updatePageIdentity(); renderTodaySchedule(); render(); renderSchedule(); }
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
document.querySelectorAll('.status-filters .chip').forEach(chip => chip.addEventListener('click', () => { document.querySelectorAll('.status-filters .chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); activeFilter = chip.dataset.filter; catalogLimit = 48; render(); }));
document.querySelector('#loadMoreCatalog').addEventListener('click', () => { catalogLimit += 48; render(); });
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
document.querySelector('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('light'); document.querySelector('#themeToggle').textContent = document.body.classList.contains('light') ? '☀️' : '🌙'; });
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
renderCatalogViews();
