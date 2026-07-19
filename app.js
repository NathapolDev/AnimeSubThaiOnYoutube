'use strict';

const data = window.ANIME_DATA || [];
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const SEASON_LABELS = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };
const NEW_EPISODE_WINDOW_MS = 48 * 60 * 60 * 1000;
const CATALOG_PAGE_SIZE = 48;

function bangkokNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), dayIndex: WEEKDAY_INDEX[get('weekday')] ?? now.getDay(), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const NOW = bangkokNow();
const currentYear = NOW.year;
const currentSeason = ['winter', 'spring', 'summer', 'fall'][Math.floor((NOW.month - 1) / 3)];
const tvYears = [...new Set(data.filter(item => item.jikanType === 'TV').map(item => Number(item.catalogYear || item.year)).filter(Boolean))].sort((a, b) => b - a);
let selectedYear = tvYears.includes(currentYear) ? currentYear : (tvYears[0] || currentYear);
let activeSeason = currentSeason;
let activeFilter = 'all';
let activeChannel = 'all';
let query = '';
let sortBy = 'updated';
let favoritesOnly = false;
let catalogLimit = CATALOG_PAGE_SIZE;
let pendingMobileTab = null;

const $ = selector => document.querySelector(selector);
const grid = $('#grid');
const resultText = $('#resultText');
const scheduleList = $('#scheduleList');
const rankingList = $('#seasonRanking');
const detailDialog = $('#detailDialog');
const filterDialog = $('#filterDialog');
const sheetControllers = new WeakMap();
const dialogContent = $('#dialogContent');

function setActiveMobileTab(target) {
  document.querySelectorAll('[data-mobile-tab]').forEach(tab => {
    const active = tab.dataset.mobileTab === target;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}
const goToTopButton = $('#goToTop');
const statusMap = { available: { label: 'ดูได้แล้ว', dot: 'green' }, upcoming: { label: 'รอเริ่มฉาย', dot: 'amber' } };

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
};
const favorites = new Set(store.get('astyt:favorites', []));

function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  store.set('astyt:favorites', [...favorites]);
}
function icon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`; }
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
  return `<img class="poster" src="${escapeHtml(thumb ? posterThumb(item.poster) : item.poster)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.hidden=true;this.parentElement.classList.add('is-missing')" /><span class="poster-fallback" aria-hidden="true">ไม่มีรูป</span>`;
}
function crunchyrollOf(item) { return item.crunchyroll?.seriesUrl ? item.crunchyroll : null; }
function bilibiliOf(item) { return item.bilibili?.seriesUrl ? item.bilibili : null; }
function netflixOf(item) { return item.netflix?.seriesUrl ? item.netflix : null; }
function hasYoutubeSource(item) { return Boolean(item.playlistId || item.latestVideoUrl || (item.availableEpisodes || []).length); }
function platformNames(item) {
  const names = [];
  if (hasYoutubeSource(item)) names.push('YouTube');
  if (crunchyrollOf(item)) names.push('Crunchyroll');
  if (bilibiliOf(item)) names.push('Bilibili');
  if (netflixOf(item)) names.push('Netflix');
  return names.length ? names : ['ยังไม่ประกาศ'];
}
function platformEpisodeRows(platform, label) {
  const real = Array.isArray(platform.availableEpisodes) ? platform.availableEpisodes : [];
  if (real.length) return real;
  const count = Number(platform.episodeCount) || 0;
  return Array.from({ length: count }, (_, index) => ({ number: count - index, title: `รับชมได้บน ${label}`, url: platform.seriesUrl }));
}
function channelShort(channel) {
  const value = String(channel || '');
  if (value.includes('Ani-One')) return 'Ani-One';
  if (value.includes('Muse')) return 'Muse';
  if (value.includes('Tropics')) return 'Tropics';
  return value && !value.includes('ยังไม่') ? value : 'รอช่องทางไทย';
}
function latestText(item) {
  if (Number(item.currentEpisode) > 0) return `ตอนที่ ${Number(item.currentEpisode)}`;
  for (const [platform, label] of [[crunchyrollOf(item), 'Crunchyroll'], [bilibiliOf(item), 'Bilibili'], [netflixOf(item), 'Netflix']]) {
    if (platform && Number(platform.episodeCount) > 0) return `${label} ${Number(platform.latestEpisodeNumber) || Number(platform.episodeCount)} ตอน`;
  }
  return item.status === 'upcoming' ? 'ยังไม่เริ่มฉาย' : 'รอตรวจสอบตอนล่าสุด';
}
function hasNewEpisode(item) { const published = Date.parse(item.latestPublishedAt || ''); return Number.isFinite(published) && Date.now() - published < NEW_EPISODE_WINDOW_MS; }
function itemYear(item) { return Number(item.catalogYear || item.year || 0); }
function isTvInYear(item) { return item.jikanType === 'TV' && itemYear(item) === selectedYear; }
function isCurrentSeasonTv(item) { return item.jikanType === 'TV' && itemYear(item) === currentYear && item.season === currentSeason; }
function isCurrentlyAiring(item) { return item.jikanStatus !== 'Finished Airing'; }
function hasPremiered(item) { return !item.premiere || Date.parse(item.premiere) <= Date.now(); }
function isInCatalogScope(item) { return isTvInYear(item) && (activeSeason === 'all' || item.season === activeSeason); }
function isMatch(item) {
  if (!isInCatalogScope(item) || (favoritesOnly && !favorites.has(item.id)) || (activeFilter !== 'all' && item.status !== activeFilter)) return false;
  if (activeChannel === '__crunchyroll' && !crunchyrollOf(item)) return false;
  if (activeChannel === '__bilibili' && !bilibiliOf(item)) return false;
  if (activeChannel === '__netflix' && !netflixOf(item)) return false;
  if (!activeChannel.startsWith('__') && activeChannel !== 'all' && item.channel !== activeChannel) return false;
  if (!query) return true;
  return normalize([item.titleThai, item.titleOriginal, item.altTitle, item.channel, item.studio, item.source, ...(item.genres || [])].join(' ')).includes(normalize(query));
}
function parseAirTime(item) {
  const match = String(item.airTimeThai || '').match(/^(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)\s+(\d{1,2}):(\d{2})/);
  return match ? { dayIndex: THAI_DAYS.indexOf(match[1]), minutes: Number(match[2]) * 60 + Number(match[3]), time: `${match[2].padStart(2, '0')}:${match[3]}` } : null;
}
const sorters = {
  updated: (a, b) => (Date.parse(b.latestPublishedAt || '') || 0) - (Date.parse(a.latestPublishedAt || '') || 0),
  score: (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0),
  premiere: (a, b) => (Date.parse(a.premiere || '') || Infinity) - (Date.parse(b.premiere || '') || Infinity),
  title: (a, b) => String(a.titleThai || '').localeCompare(String(b.titleThai || ''), 'th')
};

function renderTodaySchedule() {
  const todayIndex = bangkokNow().dayIndex;
  const items = data.filter(item => isCurrentSeasonTv(item) && isCurrentlyAiring(item) && hasPremiered(item)).map(item => ({ item, air: parseAirTime(item) })).filter(entry => entry.air?.dayIndex === todayIndex).sort((a, b) => a.air.minutes - b.air.minutes);
  $('#todayDate').textContent = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date());
  $('#todayCount').textContent = `${items.length} เรื่อง`;
  $('#todaySchedule').innerHTML = items.length ? items.map(({ item, air }, index) => `<button class="today-card" type="button" data-id="${escapeHtml(item.id)}"><span class="today-poster">${posterHtml(item, { eager: index < 5 })}<span class="today-time">${air.time}</span></span><strong>${escapeHtml(item.titleThai)}</strong><small>${escapeHtml(channelShort(item.channel))}${hasNewEpisode(item) ? ' • ตอนใหม่' : ''}</small></button>`).join('') : '<div class="today-empty"><strong>วันนี้ยังไม่มีรายการที่ระบุเวลา</strong><span>ดูตารางทั้งสัปดาห์ได้ด้านล่าง</span></div>';
}

function rankingItemTemplate(item, rank, featured = false) {
  return `<button class="ranking-item rank-${rank}${featured ? ' is-featured' : ''}" type="button" data-id="${escapeHtml(item.id)}" aria-label="อันดับ ${rank} ${escapeHtml(item.titleThai)} คะแนน MAL ${Number(item.score).toFixed(2)}"><span class="ranking-number" aria-hidden="true">${rank}</span><span class="ranking-poster">${posterHtml(item, { eager: rank <= 3 })}</span><span class="ranking-copy"><strong>${escapeHtml(item.titleThai)}</strong><span class="ranking-score">MAL ${Number(item.score).toFixed(2)}</span></span></button>`;
}
function renderSeasonRanking() {
  const ranked = data.filter(item => isCurrentSeasonTv(item) && Number(item.score) > 0).sort((a, b) => Number(b.score) - Number(a.score) || String(a.titleThai).localeCompare(String(b.titleThai), 'th')).slice(0, 10);
  const seasonLabel = SEASON_LABELS[currentSeason] || currentSeason;
  $('#seasonRankingHeading').textContent = `อนิเมะคะแนนสูงสุด ${seasonLabel} ${currentYear}`;
  $('#seasonRankingNote').textContent = 'คะแนนจาก MyAnimeList • อนิเมะ TV ฤดูกาลปัจจุบัน';
  if (!ranked.length) { rankingList.innerHTML = '<p class="ranking-empty">ยังไม่มีคะแนน MyAnimeList สำหรับฤดูกาลนี้</p>'; return; }
  const topThree = [ranked[1], ranked[0], ranked[2]].filter(Boolean).map(item => rankingItemTemplate(item, ranked.indexOf(item) + 1, true)).join('');
  const remaining = ranked.slice(3).map((item, index) => rankingItemTemplate(item, index + 4)).join('');
  rankingList.innerHTML = `<div class="ranking-featured">${topThree}</div>${remaining ? `<div class="ranking-rest">${remaining}</div>` : ''}`;
}

function renderStats() {
  const scope = data.filter(item => item.jikanType === 'TV' && itemYear(item) === selectedYear);
  const available = scope.filter(item => item.status === 'available');
  const stats = [[scope.length, `อนิเมะ TV ปี ${selectedYear}`], [available.length, 'มีช่องทางรับชม'], [scope.reduce((sum, item) => sum + availableEpisodeCount(item.availableEpisodes), 0), 'ตอนที่รับชมได้'], [scope.filter(hasNewEpisode).length, 'อัปเดตใน 48 ชม.']];
  $('#statsBar').innerHTML = stats.map(([value, label]) => `<div class="stat"><span>${value.toLocaleString('th-TH')}</span><small>${label}</small></div>`).join('');
}

function preferredWatch(item) {
  const youtubeSource = item.latestVideoUrl
    || item.availableEpisodes?.[0]?.videoUrl
    || (item.playlistId ? `https://www.youtube.com/playlist?list=${encodeURIComponent(item.playlistId)}` : '')
    || (item.platform === 'YouTube' ? item.link : '');
  const youtube = safeExternalUrl(youtubeSource);
  if (youtube !== '#') return { url: youtube, label: 'รับชม' };
  for (const [platform, label] of [[crunchyrollOf(item), 'Crunchyroll'], [bilibiliOf(item), 'Bilibili'], [netflixOf(item), 'Netflix']]) {
    const url = safeExternalUrl(platform?.seriesUrl);
    if (url !== '#') return { url, label };
  }
  const info = safeExternalUrl(item.link);
  if (info !== '#') return { url: info, label: 'ข้อมูล' };
  return { url: '#', label: 'รอลิงก์' };
}
function cardTemplate(item, index) {
  const st = statusMap[item.status] || statusMap.upcoming;
  const watch = preferredWatch(item);
  const names = platformNames(item).filter(name => name !== 'ยังไม่ประกาศ');
  const isFav = favorites.has(item.id);
  return `<article class="anime-card" tabindex="0" role="button" aria-label="${escapeHtml(item.titleThai)}" data-id="${escapeHtml(item.id)}"><div class="poster-wrap">${posterHtml(item, { eager: index < 6 })}<span class="card-status"><i class="dot ${st.dot}"></i>${st.label}${hasNewEpisode(item) ? ' • ตอนใหม่' : ''}</span><button class="fav-btn${isFav ? ' is-fav' : ''}" type="button" data-fav="${escapeHtml(item.id)}" aria-pressed="${isFav}" aria-label="${isFav ? 'นำออกจาก' : 'เพิ่มใน'}รายการโปรด">${icon('heart')}</button><div class="platform-strip">${names.slice(0, 2).map(name => `<span class="platform-badge" data-platform="${escapeHtml(name)}">${escapeHtml(name)}</span>`).join('')}${Number(item.score) > 0 ? `<span class="score-badge">★ ${Number(item.score).toFixed(1)}</span>` : ''}</div></div><div class="card-body"><h3>${escapeHtml(item.titleThai)}</h3><p class="original">${escapeHtml(item.titleOriginal)}</p><div class="card-meta"><span>${escapeHtml(latestText(item))}</span><span>${escapeHtml(channelShort(item.channel))}</span></div><div class="card-actions">${watch.url !== '#' ? `<a class="watch-btn" href="${escapeHtml(watch.url)}" target="_blank" rel="noopener">${icon('play')}${escapeHtml(watch.label)}</a>` : '<span class="watch-btn is-disabled">รอลิงก์รับชม</span>'}<span class="detail-link">รายละเอียด</span></div></div></article>`;
}
function renderCatalog() {
  const items = data.filter(isMatch).sort(sorters[sortBy] || sorters.updated);
  const visible = items.slice(0, catalogLimit);
  grid.innerHTML = visible.map(cardTemplate).join('') || '<div class="data-note"><h2>ไม่พบรายการ</h2><p>ลองเปลี่ยนคำค้นหรือล้างตัวกรอง</p></div>';
  const scopeTotal = data.filter(isInCatalogScope).length;
  resultText.textContent = favoritesOnly ? `รายการโปรด ${items.length} เรื่อง` : `พบ ${items.length} จาก ${scopeTotal} รายการ`;
  const loadMore = $('#loadMoreCatalog');
  loadMore.hidden = visible.length >= items.length;
  loadMore.textContent = `แสดงเพิ่มอีก ${Math.min(CATALOG_PAGE_SIZE, items.length - visible.length)} เรื่อง`;
  updateControlState();
}

function renderSchedule() {
  const todayIndex = bangkokNow().dayIndex;
  const airing = data.filter(item => isInCatalogScope(item) && isCurrentlyAiring(item) && hasPremiered(item));
  const byDay = new Map();
  const unscheduled = [];
  for (const item of airing) {
    const air = parseAirTime(item);
    if (!air) { unscheduled.push(item); continue; }
    const list = byDay.get(air.dayIndex) || [];
    list.push({ item, air }); byDay.set(air.dayIndex, list);
  }
  const sections = Array.from({ length: 7 }, (_, offset) => (todayIndex + offset) % 7).filter(day => byDay.has(day)).map(day => `<section class="schedule-day${day === todayIndex ? ' is-today' : ''}"><h3>วัน${THAI_DAYS[day]}${day === todayIndex ? '<span class="today-tag">วันนี้</span>' : ''}</h3><div>${byDay.get(day).sort((a, b) => a.air.minutes - b.air.minutes).map(({ item, air }) => `<button class="schedule-item" type="button" data-id="${escapeHtml(item.id)}"><span class="schedule-time">${air.time}</span><span class="schedule-copy"><strong>${escapeHtml(item.titleThai)}</strong><span>${escapeHtml(channelShort(item.channel))} • ${escapeHtml(latestText(item))}</span></span></button>`).join('')}</div></section>`);
  if (unscheduled.length) sections.push(`<section class="schedule-day"><h3>รอประกาศเวลาไทย</h3>${unscheduled.sort((a, b) => String(a.titleThai).localeCompare(String(b.titleThai), 'th')).map(item => `<button class="schedule-item" type="button" data-id="${escapeHtml(item.id)}"><span class="schedule-time">—</span><span class="schedule-copy"><strong>${escapeHtml(item.titleThai)}</strong><span>${escapeHtml(channelShort(item.channel))}</span></span></button>`).join('')}</section>`);
  scheduleList.innerHTML = sections.join('') || '<p class="schedule-empty">ไม่มีรายการออกอากาศในขอบเขตที่เลือก</p>';
}

const channels = [...new Set(data.filter(item => item.jikanType === 'TV' && item.channel && !item.channel.includes('ยังไม่')).map(item => item.channel))].sort();
const channelOptions = [{ value: 'all', label: 'ทุกช่องทาง' }, ...channels.map(value => ({ value, label: channelShort(value) }))];
if (data.some(item => item.jikanType === 'TV' && crunchyrollOf(item))) channelOptions.push({ value: '__crunchyroll', label: 'Crunchyroll' });
if (data.some(item => item.jikanType === 'TV' && bilibiliOf(item))) channelOptions.push({ value: '__bilibili', label: 'Bilibili' });
if (data.some(item => item.jikanType === 'TV' && netflixOf(item))) channelOptions.push({ value: '__netflix', label: 'Netflix' });

function filterSurfaceTemplate() {
  const chips = (name, options) => `<div class="filter-block"><span class="filter-label">${name}</span><div class="filter-options">${options.map(([value, label]) => `<button class="filter-chip" type="button" data-filter-key="${name === 'ฤดูกาล' ? 'season' : name === 'สถานะ' ? 'status' : 'channel'}" data-filter-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join('')}</div></div>`;
  return `<div class="filter-block"><label class="filter-label" for="year-filter">ปี</label><select id="year-filter" class="select-control" data-select-key="year">${tvYears.map(year => `<option value="${year}">${year}</option>`).join('')}</select></div>${chips('ฤดูกาล', [['winter','Winter'],['spring','Spring'],['summer','Summer'],['fall','Fall'],['all','ทั้งปี']])}${chips('สถานะ', [['all','ทั้งหมด'],['available','ดูได้แล้ว'],['upcoming','รอเริ่มฉาย'],['favorites','รายการโปรด']])}${chips('ช่องทาง', channelOptions.map(option => [option.value, option.label]))}<div class="filter-block"><label class="filter-label" for="sort-filter">เรียงตาม</label><select id="sort-filter" class="select-control" data-select-key="sort"><option value="updated">อัปเดตล่าสุด</option><option value="score">คะแนน MAL</option><option value="premiere">วันเริ่มฉาย</option><option value="title">ชื่อเรื่อง (ก-ฮ)</option></select></div>`;
}
$('#mobileFilters').innerHTML = filterSurfaceTemplate();

function updateControlState() {
  document.querySelectorAll('[data-select-key="year"]').forEach(select => { select.value = String(selectedYear); });
  document.querySelectorAll('[data-select-key="sort"]').forEach(select => { select.value = sortBy; });
  document.querySelectorAll('[data-filter-key="season"]').forEach(button => button.classList.toggle('active', button.dataset.filterValue === activeSeason));
  document.querySelectorAll('[data-filter-key="status"]').forEach(button => button.classList.toggle('active', button.dataset.filterValue === (favoritesOnly ? 'favorites' : activeFilter)));
  document.querySelectorAll('[data-filter-key="channel"]').forEach(button => button.classList.toggle('active', button.dataset.filterValue === activeChannel));
  const count = Number(activeSeason !== currentSeason) + Number(activeFilter !== 'all') + Number(activeChannel !== 'all') + Number(sortBy !== 'updated') + Number(favoritesOnly) + Number(selectedYear !== (tvYears.includes(currentYear) ? currentYear : tvYears[0]));
  const countBadge = $('#filterCount'); countBadge.hidden = count === 0; countBadge.textContent = count;
  $('#activeFilterSummary').textContent = [SEASON_LABELS[activeSeason] || 'ทั้งปี', activeFilter !== 'all' ? statusMap[activeFilter]?.label : '', activeChannel !== 'all' ? channelOptions.find(option => option.value === activeChannel)?.label : '', favoritesOnly ? 'รายการโปรด' : ''].filter(Boolean).join(' • ');
  const favoriteTab = document.querySelector('[data-mobile-tab="favorites"]');
  if (favoritesOnly) setActiveMobileTab('favorites');
  else if (favoriteTab?.classList.contains('active')) {
    favoriteTab?.classList.remove('active');
    favoriteTab?.removeAttribute('aria-current');
    syncMobileTabToViewport();
  }
}
function resetFilters() {
  selectedYear = tvYears.includes(currentYear) ? currentYear : (tvYears[0] || currentYear);
  activeSeason = currentSeason; activeFilter = 'all'; activeChannel = 'all'; sortBy = 'updated'; favoritesOnly = false; catalogLimit = CATALOG_PAGE_SIZE;
  renderCatalogViews();
}

function episodeRowsTemplate(episodes) {
  return episodes.map(episode => {
    const url = safeExternalUrl(episode.videoUrl || episode.url);
    const label = episode.startNumber !== undefined && episode.endNumber !== undefined ? `ตอนที่ ${escapeHtml(episode.startNumber)}–${escapeHtml(episode.endNumber)}` : episode.number !== null && episode.number !== undefined ? `ตอนที่ ${escapeHtml(episode.number)}` : 'ตอนพิเศษ';
    return `<article class="episode-item"><div class="episode-number">${label}</div><div class="episode-copy"><strong>${escapeHtml(episode.title || 'ไม่มีชื่อตอน')}</strong>${episode.publishedAt ? `<span>${formatDate(episode.publishedAt)}</span>` : ''}</div>${url !== '#' ? `<a class="episode-watch" href="${escapeHtml(url)}" target="_blank" rel="noopener">รับชม</a>` : ''}</article>`;
  }).join('');
}
function renderActivePlatform(key, platforms, limits) {
  document.querySelectorAll('[data-platform-tab]').forEach(tab => { const active = tab.dataset.platformTab === key; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  const panel = $('#platformPanel');
  const platform = platforms.find(entry => entry.key === key);
  if (!platform) return;
  const visible = platform.episodes.slice(0, limits[key]);
  panel.innerHTML = `<div class="episode-heading"><h3>${escapeHtml(platform.title)}</h3><span>${platform.episodes.length} ตอน</span></div>${platform.note ? `<p class="episode-note">${escapeHtml(platform.note)}</p>` : ''}<div class="episode-list">${visible.length ? episodeRowsTemplate(visible) : '<p class="episode-empty">ยังไม่มีรายการตอน</p>'}</div><button class="load-more-btn" type="button" data-platform-more="${key}" ${visible.length >= platform.episodes.length ? 'hidden' : ''}>ดูตอนเก่ากว่า (${platform.episodes.length - visible.length} ตอน)</button>`;
}
function showDetail(id, { updateHash = true } = {}) {
  const item = data.find(entry => entry.id === id); if (!item) return;
  const st = statusMap[item.status] || statusMap.upcoming;
  const cr = crunchyrollOf(item), bili = bilibiliOf(item), netflix = netflixOf(item);
  const youtubeEpisodes = Array.isArray(item.availableEpisodes) ? item.availableEpisodes : [];
  const platforms = [];
  if (hasYoutubeSource(item)) platforms.push({ key: 'youtube', label: 'YouTube', title: 'ตอนที่รับชมได้บน YouTube', episodes: youtubeEpisodes, url: safeExternalUrl(item.latestVideoUrl || item.link) });
  if (cr) platforms.push({ key: 'crunchyroll', label: 'Crunchyroll', title: 'ตอนบน Crunchyroll', episodes: platformEpisodeRows(cr, 'Crunchyroll'), url: safeExternalUrl(cr.seriesUrl), note: 'โปรดตรวจสอบสิทธิ์และภาษาซับไทยในแอป' });
  if (bili) platforms.push({ key: 'bilibili', label: 'Bilibili', title: 'ตอนบน Bilibili TV', episodes: platformEpisodeRows(bili, 'Bilibili TV'), url: safeExternalUrl(bili.seriesUrl), note: 'โปรดตรวจสอบสิทธิ์และภาษาซับไทยในแอป' });
  if (netflix) platforms.push({ key: 'netflix', label: 'Netflix', title: 'ตอนบน Netflix', episodes: platformEpisodeRows(netflix, 'Netflix'), url: safeExternalUrl(netflix.seriesUrl), note: 'โปรดตรวจสอบสิทธิ์รับชมในไทยและภาษาซับในแอป' });
  const activePlatform = platforms[0];
  const watch = preferredWatch(item);
  const isFav = favorites.has(item.id);
  const playlistUrl = item.playlistId ? safeExternalUrl(`https://www.youtube.com/playlist?list=${item.playlistId}`) : '#';
  const trailerUrl = safeExternalUrl(item.trailerUrl), malUrl = safeExternalUrl(item.malUrl);
  const actionLinks = [['Playlist', playlistUrl], ...platforms.filter(p => p.key !== 'youtube').map(p => [p.label, p.url]), ['ตัวอย่าง', trailerUrl], ['MyAnimeList', malUrl]].filter(([, url]) => url !== '#');
  dialogContent.innerHTML = `<div class="detail-hero"><div class="detail-poster">${posterHtml(item, { thumb: false, eager: true })}</div><div class="detail-title"><span class="detail-status"><i class="dot ${st.dot}"></i>${st.label} • ${escapeHtml(platformNames(item).join(' / '))}</span><h2>${escapeHtml(item.titleThai)}</h2><p class="original">${escapeHtml(item.titleOriginal)}${item.altTitle ? `<br>${escapeHtml(item.altTitle)}` : ''}</p><div class="detail-primary-actions">${watch.url !== '#' ? `<a class="primary-button" href="${escapeHtml(watch.url)}" target="_blank" rel="noopener">${icon('play')} รับชม</a>` : ''}<button class="secondary-button${isFav ? ' is-fav' : ''}" type="button" data-fav="${escapeHtml(item.id)}" aria-pressed="${isFav}" aria-label="รายการโปรด">${icon('heart')}</button><button class="secondary-button" type="button" data-share="${escapeHtml(item.id)}" aria-label="แชร์">${icon('share')}</button></div></div></div><div class="detail-body"><p class="summary">${escapeHtml(item.summary || 'ยังไม่มีเรื่องย่อ')}</p><div class="meta">${(item.genres || []).map(genre => `<span class="tag">${escapeHtml(genre)}</span>`).join('')}</div><dl class="definition-list"><div class="definition-row"><dt>ตอนล่าสุด</dt><dd>${escapeHtml(latestText(item))}${Number(item.episodes) > 0 ? ` / ${Number(item.episodes)} ตอน` : ''}</dd></div><div class="definition-row"><dt>เริ่มฉาย</dt><dd>${formatDateOnly(item.premiere)}</dd></div><div class="definition-row"><dt>เวลาฉาย (ไทย)</dt><dd>${escapeHtml(item.airTimeThai || '—')}</dd></div><div class="definition-row"><dt>สตูดิโอ</dt><dd>${escapeHtml(item.studio || '—')}</dd></div><div class="definition-row"><dt>คะแนน MAL</dt><dd>${Number(item.score) > 0 ? `★ ${Number(item.score).toFixed(2)}` : '—'}</dd></div><div class="definition-row"><dt>ตรวจสอบล่าสุด</dt><dd>${formatDate(item.lastCheckedAt)}</dd></div></dl>${platforms.length ? `<div class="platform-tabs" role="tablist" aria-label="ช่องทางรับชม">${platforms.map((platform, index) => `<button class="platform-tab${index === 0 ? ' active' : ''}" type="button" role="tab" data-platform-tab="${platform.key}" aria-selected="${index === 0}">${escapeHtml(platform.label)}</button>`).join('')}</div><section id="platformPanel" class="platform-panel"></section>` : '<p class="episode-empty">ยังไม่มีช่องทางรับชมที่ยืนยันแล้ว</p>'}<div class="action-rail">${actionLinks.map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`).join('')}</div></div>`;
  openSheet(detailDialog);
  detailDialog.querySelector('.detail-panel').scrollTop = 0;
  const limits = Object.fromEntries(platforms.map(platform => [platform.key, 10]));
  if (activePlatform) renderActivePlatform(activePlatform.key, platforms, limits);
  dialogContent.onclick = event => {
    const tab = event.target.closest('[data-platform-tab]'); if (tab) renderActivePlatform(tab.dataset.platformTab, platforms, limits);
    const more = event.target.closest('[data-platform-more]'); if (more) { limits[more.dataset.platformMore] += 10; renderActivePlatform(more.dataset.platformMore, platforms, limits); }
  };
  if (updateHash) history.replaceState(null, '', `#a=${encodeURIComponent(item.id)}`);
}

async function shareItem(id, button) {
  const basePath = location.pathname.replace(/index\.html$/, '');
  const url = `${location.origin}${basePath}a/${encodeURIComponent(id)}.html`;
  try { if (navigator.share && matchMedia('(max-width:767px)').matches) await navigator.share({ title: data.find(item => item.id === id)?.titleThai, url }); else { await navigator.clipboard.writeText(url); button.setAttribute('aria-label', 'คัดลอกลิงก์แล้ว'); } }
  catch (error) { if (error?.name !== 'AbortError') window.prompt('คัดลอกลิงก์นี้', url); }
}

function updatePageIdentity() { $('#brandTitle').textContent = `Anime TV ${selectedYear}`; document.title = `Anime TV ${selectedYear} — Thai YouTube Tracker`; }
function renderCatalogViews() { updatePageIdentity(); renderStats(); renderTodaySchedule(); renderSeasonRanking(); renderCatalog(); renderSchedule(); }

document.addEventListener('change', event => {
  const select = event.target.closest('[data-select-key]'); if (!select) return;
  if (select.dataset.selectKey === 'year') selectedYear = Number(select.value); else sortBy = select.value;
  catalogLimit = CATALOG_PAGE_SIZE; renderCatalogViews();
});
document.addEventListener('click', event => {
  const filter = event.target.closest('[data-filter-key]');
  if (filter) {
    const { filterKey: key, filterValue: value } = filter.dataset;
    if (key === 'season') activeSeason = value;
    if (key === 'status') { favoritesOnly = value === 'favorites'; activeFilter = favoritesOnly ? 'all' : value; }
    if (key === 'channel') activeChannel = value;
    catalogLimit = CATALOG_PAGE_SIZE; renderCatalogViews(); return;
  }
  const favorite = event.target.closest('[data-fav]');
  if (favorite) { event.preventDefault(); event.stopPropagation(); toggleFavorite(favorite.dataset.fav); if (detailDialog.open) showDetail(favorite.dataset.fav, { updateHash: false }); else renderCatalog(); return; }
  const share = event.target.closest('[data-share]'); if (share) { shareItem(share.dataset.share, share); return; }
  if (event.target.closest('a')) return;
  const item = event.target.closest('[data-id]'); if (item) showDetail(item.dataset.id);
});
grid.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('anime-card')) { event.preventDefault(); showDetail(event.target.dataset.id); } });

let searchTimer = 0;
$('#searchInput').addEventListener('input', event => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { query = event.target.value; catalogLimit = CATALOG_PAGE_SIZE; renderCatalog(); }, 120); });
$('#headerSearch').addEventListener('click', () => { $('#catalog').scrollIntoView(); setTimeout(() => $('#searchInput').focus(), 350); });
$('#loadMoreCatalog').addEventListener('click', () => { catalogLimit += CATALOG_PAGE_SIZE; renderCatalog(); });
$('#openFilters').addEventListener('click', () => openSheet(filterDialog));
$('#closeFilters').addEventListener('click', () => closeSheet(filterDialog));
$('#resetFilters').addEventListener('click', resetFilters);
$('#closeDialog').addEventListener('click', () => closeSheet(detailDialog));
[filterDialog, detailDialog].forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog) closeSheet(dialog); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeSheet(dialog); });
});
detailDialog.addEventListener('close', () => { if (location.hash.startsWith('#a=')) history.replaceState(null, '', location.pathname + location.search); });

const themeToggle = $('#themeToggle');
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  themeToggle.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'ใช้ธีมสว่าง' : 'ใช้ธีมมืด');
  $('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#f5f5f7');
}
const storedTheme = store.get('astyt:theme', null);
applyTheme(storedTheme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
themeToggle.addEventListener('click', () => { const next = document.body.classList.contains('dark') ? 'light' : 'dark'; applyTheme(next); store.set('astyt:theme', next); });

document.querySelectorAll('[data-mobile-tab]').forEach(tab => tab.addEventListener('click', () => {
  const target = tab.dataset.mobileTab;
  setActiveMobileTab(target);
  if (target === 'favorites') {
    pendingMobileTab = null;
    favoritesOnly = true;
    activeFilter = 'all';
    catalogLimit = CATALOG_PAGE_SIZE;
    renderCatalog();
    setActiveMobileTab('favorites');
    $('#catalog').scrollIntoView();
    return;
  }
  pendingMobileTab = target;
  if (favoritesOnly) {
    favoritesOnly = false;
    catalogLimit = CATALOG_PAGE_SIZE;
    renderCatalog();
  }
  setActiveMobileTab(target);
  document.querySelector(`#${target}`)?.scrollIntoView();
}));
if ('IntersectionObserver' in window) {
  const navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible || favoritesOnly) return;
    if (pendingMobileTab && visible.target.id !== pendingMobileTab) return;
    pendingMobileTab = null;
    setActiveMobileTab(visible.target.id);
  }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, .15, .5] });
  ['top', 'ranking', 'catalog', 'schedule'].forEach(id => navObserver.observe(document.getElementById(id)));
}

function syncMobileTabToViewport() {
  if (favoritesOnly || !matchMedia('(max-width:767px)').matches) return;
  pendingMobileTab = null;
  const anchorY = window.innerHeight * .28;
  const visibleSection = ['top', 'ranking', 'catalog', 'schedule']
    .map(id => document.getElementById(id))
    .find(section => {
      const rect = section.getBoundingClientRect();
      return rect.top <= anchorY && rect.bottom >= anchorY;
    });
  if (visibleSection) setActiveMobileTab(visibleSection.id);
}

let mobileNavScrollTimer = 0;
window.addEventListener('scroll', () => {
  clearTimeout(mobileNavScrollTimer);
  mobileNavScrollTimer = setTimeout(syncMobileTabToViewport, 120);
}, { passive: true });

function updateGoToTopVisibility() { goToTopButton.hidden = window.scrollY < 900; }
goToTopButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' }));
window.addEventListener('scroll', updateGoToTopVisibility, { passive: true });

function enableRailDrag(el) {
  if (!el) return;
  let startX = 0, startScroll = 0, dragging = false, suppressClick = false, pointerId = null;
  el.addEventListener('dragstart', event => event.preventDefault());
  el.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startScroll = el.scrollLeft;
    dragging = false;
    suppressClick = false;
  });
  el.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientX - startX;
    if (!dragging && Math.abs(delta) < 10) return;
    if (!dragging) {
      dragging = true;
      el.setPointerCapture(pointerId);
      el.classList.add('is-dragging');
    }
    event.preventDefault();
    el.scrollLeft = startScroll - delta;
  });
  const finish = event => {
    if (event.pointerId !== pointerId) return;
    suppressClick = event.type === 'pointerup' && dragging;
    if (suppressClick) requestAnimationFrame(() => { suppressClick = false; });
    dragging = false;
    pointerId = null;
    el.classList.remove('is-dragging');
  };
  window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  el.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } }, true);
}
enableRailDrag($('#todaySchedule'));

function enableSheetDrag(dialog) {
  const panel = dialog.querySelector('.sheet-panel'); const handle = dialog.querySelector('[data-sheet-handle]'); if (!panel || !handle) return;
  let pointerId = null, startY = 0, lastY = 0, lastTime = 0, velocity = 0, closeTimer = 0;
  const isMobile = () => matchMedia('(max-width:767px)').matches;
  const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
  const currentTranslateY = () => {
    const values = getComputedStyle(panel).transform.match(/matrix.*\((.+)\)/)?.[1].split(',').map(Number) || [];
    return values.length === 16 ? values[13] : (values[5] || 0);
  };
  const open = () => {
    clearTimeout(closeTimer); if (dialog.open) return;
    if (!isMobile() || reduced()) { dialog.showModal(); return; }
    dialog.classList.add('is-dragging'); panel.style.setProperty('--sheet-y', `${window.innerHeight}px`); dialog.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => { dialog.classList.remove('is-dragging'); panel.style.removeProperty('--sheet-y'); }));
  };
  const close = () => {
    clearTimeout(closeTimer); if (!dialog.open) return;
    if (!isMobile() || reduced()) { dialog.close(); return; }
    dialog.classList.remove('is-dragging'); panel.style.setProperty('--sheet-y', `${panel.offsetHeight}px`);
    closeTimer = window.setTimeout(() => { if (dialog.open) dialog.close(); }, 420);
  };
  sheetControllers.set(dialog, { open, close });
  handle.addEventListener('pointerdown', event => {
    if (!isMobile()) return;
    event.preventDefault();
    clearTimeout(closeTimer); const currentY = Math.max(0, currentTranslateY()); dialog.classList.add('is-dragging'); panel.style.setProperty('--sheet-y', `${currentY}px`);
    pointerId = event.pointerId; startY = event.clientY - currentY; lastY = event.clientY; lastTime = performance.now(); velocity = 0; handle.setPointerCapture(pointerId);
  });
  handle.addEventListener('pointermove', event => { if (event.pointerId !== pointerId) return; event.preventDefault(); const now = performance.now(); const delta = Math.max(0, event.clientY - startY); velocity = (event.clientY - lastY) / Math.max(1, now - lastTime); lastY = event.clientY; lastTime = now; panel.style.setProperty('--sheet-y', `${delta}px`); });
  const finish = event => { if (event.pointerId !== pointerId) return; const delta = Math.max(0, event.clientY - startY); pointerId = null; dialog.classList.remove('is-dragging'); if (delta + velocity * 180 > Math.min(220, panel.offsetHeight * .28)) close(); else panel.style.removeProperty('--sheet-y'); };
  handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
  dialog.addEventListener('close', () => panel.style.removeProperty('--sheet-y'));
}
function openSheet(dialog) { const controller = sheetControllers.get(dialog); if (controller) controller.open(); else dialog.showModal(); }
function closeSheet(dialog) { const controller = sheetControllers.get(dialog); if (controller) controller.close(); else dialog.close(); }
enableSheetDrag(filterDialog); enableSheetDrag(detailDialog);

renderCatalogViews(); updateGoToTopVisibility();
const deepLink = location.hash.match(/^#a=(.+)$/); if (deepLink) showDetail(decodeURIComponent(deepLink[1]), { updateHash: false });
