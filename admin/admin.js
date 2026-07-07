/* Admin editor for data/anime.json — served by tools/admin-server.js (local only). */
(() => {
  'use strict';

  // ---- field layout -------------------------------------------------------
  // Grouped so hand-edited fields come first and pipeline bookkeeping stays in
  // one read-only section at the bottom. `type` drives both rendering and the
  // conversion back to JSON values.
  const SECTIONS = [
    {
      title: 'ข้อมูลเรื่อง',
      fields: [
        { key: 'titleThai', label: 'ชื่อไทย', type: 'text', wide: true },
        { key: 'titleOriginal', label: 'ชื่อโรมาจิ/ญี่ปุ่น', type: 'text' },
        { key: 'altTitle', label: 'ชื่ออังกฤษ/ชื่ออื่น', type: 'text' },
        { key: 'genres', label: 'แนวเรื่อง', type: 'csv', hint: 'คั่นด้วยเครื่องหมายจุลภาค เช่น Action, Fantasy' },
        { key: 'poster', label: 'รูปโปสเตอร์ (URL)', type: 'poster', wide: true },
        { key: 'summary', label: 'เรื่องย่อ', type: 'textarea', wide: true },
        { key: 'note', label: 'โน้ตภายใน', type: 'textarea', wide: true, hint: 'บันทึกช่วยจำสำหรับหลังบ้าน ไม่แสดงบนหน้าเว็บ' }
      ]
    },
    {
      title: 'การออกอากาศ',
      fields: [
        { key: 'studio', label: 'สตูดิโอ', type: 'text' },
        { key: 'source', label: 'ต้นฉบับ', type: 'text', hint: 'เช่น Manga, Light novel, Original' },
        { key: 'episodes', label: 'จำนวนตอนทั้งหมด', type: 'text', hint: 'เก็บเป็นข้อความ ใส่ "?" ได้ถ้ายังไม่ประกาศ' },
        { key: 'premiere', label: 'วันฉายตอนแรก (ISO)', type: 'text', hint: 'เช่น 2026-07-03T00:00:00+00:00' },
        { key: 'airTimeThai', label: 'เวลาฉาย (ไทย)', type: 'text' },
        { key: 'season', label: 'ซีซัน', type: 'select', options: ['winter', 'spring', 'summer', 'fall'] },
        { key: 'year', label: 'ปีฉาย', type: 'number' },
        { key: 'catalogYear', label: 'ปีในแคตตาล็อก', type: 'number', hint: 'ปีที่เครื่องมือ discovery ใช้จับคู่' },
        { key: 'rating', label: 'เรตติ้งเนื้อหา', type: 'text' },
        { key: 'score', label: 'คะแนน MAL', type: 'number' },
        { key: 'jikanType', label: 'ประเภท (Jikan)', type: 'select', options: ['TV', 'Movie', 'ONA', 'OVA', 'TV Special', 'Special'] },
        { key: 'jikanStatus', label: 'สถานะออกอากาศ (Jikan)', type: 'select', options: ['Currently Airing', 'Not yet aired', 'Finished Airing'] }
      ]
    },
    {
      title: 'ช่องทางรับชม',
      fields: [
        { key: 'platform', label: 'แพลตฟอร์มหลัก', type: 'text', hint: 'เช่น YouTube หรือ "ยังไม่ประกาศ"' },
        { key: 'channel', label: 'ช่อง/ผู้ให้บริการ', type: 'text', hint: 'เช่น Ani-One Thailand, Muse Thailand' },
        { key: 'status', label: 'สถานะบนเว็บ', type: 'select', options: ['available', 'upcoming'] },
        { key: 'confidence', label: 'ระดับความมั่นใจของสถานะ', type: 'text', hint: 'ปกติ pipeline ตั้งให้ เช่น confirmed_from_youtube_playlist' },
        { key: 'link', label: 'ลิงก์รับชมหลัก', type: 'url', wide: true, hint: 'ถ้าเป็นลิงก์ playlist ระบบจะดึง playlistId ให้เอง' },
        { key: 'playlistId', label: 'YouTube playlist ID', type: 'text' }
      ]
    },
    {
      title: 'การจับคู่ YouTube',
      hint: 'ใช้โดย discover-youtube.js เวลาแสกนช่องทางการ — เพิ่ม alias ที่ช่องใช้ตั้งชื่อคลิปจริงเพื่อช่วยให้จับคู่เจอ',
      fields: [
        { key: 'youtubeAliases', label: 'ชื่อเรียกอื่นสำหรับจับคู่คลิป', type: 'lines', wide: true, hint: 'บรรทัดละ 1 ชื่อ (ยาวอย่างน้อย 6 ตัวอักษรจึงถูกใช้)' },
        { key: 'youtubeSourceType', label: 'แหล่งตอน', type: 'select', options: ['', 'playlist', 'channel_uploads'] },
        { key: 'youtubeChannelId', label: 'Channel ID', type: 'text' },
        { key: 'youtubeChannelTitle', label: 'ชื่อช่อง', type: 'text' },
        { key: 'youtubeOfficialChannelUrl', label: 'ลิงก์ช่องทางการ', type: 'url' },
        { key: 'youtubeResearchNotes', label: 'โน้ตจากการรีเสิร์ช', type: 'textarea', wide: true },
        { key: 'youtubeResearchSourceUrls', label: 'ลิงก์อ้างอิงรีเสิร์ช', type: 'lines', wide: true, hint: 'บรรทัดละ 1 URL' }
      ]
    },
    {
      title: 'ลิงก์อ้างอิง',
      fields: [
        { key: 'malId', label: 'MAL ID', type: 'number', hint: 'ใช้จับคู่กับ Jikan/AniList — แก้เฉพาะเมื่อจับคู่ผิดเรื่อง' },
        { key: 'malUrl', label: 'ลิงก์ MyAnimeList', type: 'url', wide: true },
        { key: 'trailerUrl', label: 'ลิงก์ตัวอย่าง', type: 'url', wide: true }
      ]
    }
  ];

  // Pipeline-owned fields shown read-only; the next tool run rewrites them, so
  // hand edits here would be wasted (use the Raw JSON tab if truly needed).
  const READONLY_KEYS = [
    'updateStatus', 'updateError', 'currentEpisode', 'latestEpisodeTitle',
    'latestVideoUrl', 'latestPublishedAt', 'lastCheckedAt',
    'youtubeMatchConfidence', 'youtubeDiscoveryStatus', 'youtubeMatchType',
    'youtubeMatchedAlias', 'youtubeMatchedVideoTitle', 'youtubeMatchedScore',
    'youtubeLastMatchedAt', 'youtubeResearchStatus', 'youtubeResearchConfidence',
    'youtubeLastResearchedAt'
  ];

  // Editable id field, only shown while creating a new entry (existing
  // entries rename via the Raw JSON tab if ever needed).
  const ID_FIELD = {
    key: 'id', label: 'ID (ต้องไม่ซ้ำกับเรื่องอื่น)', type: 'text', wide: true,
    hint: 'ตัวพิมพ์เล็กคั่นด้วยขีดกลาง เช่น neko-to-ryuu — ใช้อ้างอิงถาวร ตั้งแล้วไม่ควรเปลี่ยน'
  };

  // Skeleton for a manually added anime: every human-owned field present so the
  // form renders empty inputs, pipeline-owned fields left blank for the next
  // tool run to fill in.
  function newEntryTemplate() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const season = month <= 3 ? 'winter' : month <= 6 ? 'spring' : month <= 9 ? 'summer' : 'fall';
    return {
      id: '',
      titleThai: '', titleOriginal: '', altTitle: '',
      studio: '', source: '', episodes: '?', premiere: '', airTimeThai: '',
      channel: '', platform: 'YouTube', status: 'upcoming', confidence: '',
      link: '', genres: [], summary: '', note: '', poster: '',
      playlistId: '',
      lastCheckedAt: '', updateStatus: '', updateError: '',
      malId: null, malUrl: '', jikanType: 'TV', jikanStatus: '', rating: '',
      score: null, season, year: now.getFullYear(), trailerUrl: '',
      availableEpisodes: [],
      youtubeAliases: [], youtubeSourceType: '', youtubeChannelId: '',
      youtubeChannelTitle: '', youtubeMatchConfidence: ''
    };
  }

  // ---- state ---------------------------------------------------------------
  let items = [];
  let hashes = {};
  let currentId = null;
  let draftEntry = null; // set while creating a new entry (currentId is null)
  let dirty = false;
  let activeTab = 'form';

  const $ = id => document.getElementById(id);
  const listEl = $('anime-list');
  const formEl = $('entry-form');
  const rawEl = $('raw-json');

  // ---- helpers -------------------------------------------------------------
  function toast(message, kind) {
    const el = $('toast');
    el.textContent = message;
    el.className = `toast ${kind || ''}`;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 8000 : 3500);
  }

  function setDirty(value) {
    dirty = value;
    $('dirty-flag').hidden = !value;
  }

  function currentEntry() {
    if (draftEntry) return draftEntry;
    return items.find(item => item.id === currentId) || null;
  }

  function confirmDiscard() {
    return !dirty || confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการทิ้งหรือไม่?');
  }

  // ---- sidebar list --------------------------------------------------------
  function renderList() {
    const query = $('search').value.trim().toLowerCase();
    const filtered = items.filter(item => {
      if (!query) return true;
      return [item.id, item.titleThai, item.titleOriginal, item.altTitle]
        .some(value => (value || '').toLowerCase().includes(query));
    });
    $('list-meta').textContent = query
      ? `พบ ${filtered.length} จาก ${items.length} เรื่อง`
      : `ทั้งหมด ${items.length} เรื่อง`;

    listEl.textContent = '';
    for (const item of filtered) {
      const li = document.createElement('li');
      if (item.id === currentId) li.className = 'active';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.addEventListener('click', () => selectAnime(item.id));

      const title = document.createElement('span');
      title.className = 'row-title';
      title.textContent = item.titleThai || item.titleOriginal || item.id;

      const sub = document.createElement('span');
      sub.className = 'row-sub';
      const dot = document.createElement('span');
      dot.className = `status-dot ${item.status || ''}`;
      dot.title = item.status || '';
      sub.append(dot, `${item.season || '?'} ${item.year || ''} · ${item.channel || ''}`);

      btn.append(title, sub);
      li.append(btn);
      listEl.append(li);
    }
  }

  // ---- form rendering ------------------------------------------------------
  function makeControl(field, value) {
    let control;
    if (field.type === 'textarea') {
      control = document.createElement('textarea');
      control.value = value == null ? '' : String(value);
    } else if (field.type === 'lines') {
      control = document.createElement('textarea');
      control.value = Array.isArray(value) ? value.join('\n') : (value || '');
    } else if (field.type === 'select') {
      control = document.createElement('select');
      const options = field.options.slice();
      const current = value == null ? '' : String(value);
      if (!options.includes(current)) options.unshift(current);
      for (const option of options) {
        const el = document.createElement('option');
        el.value = option;
        el.textContent = option === '' ? '(ว่าง)' : option;
        if (option === current) el.selected = true;
        control.append(el);
      }
    } else {
      control = document.createElement('input');
      control.type = 'text';
      if (field.type === 'number') control.inputMode = 'decimal';
      if (field.type === 'csv') control.value = Array.isArray(value) ? value.join(', ') : (value || '');
      else control.value = value == null ? '' : String(value);
    }
    control.dataset.key = field.key;
    control.dataset.type = field.type;
    return control;
  }

  function makeField(field, entry) {
    const wrap = document.createElement('div');
    wrap.className = `field${field.wide ? ' wide' : ''}`;

    const label = document.createElement('label');
    label.className = 'field-label';
    const text = document.createElement('span');
    text.textContent = field.label;
    const key = document.createElement('code');
    key.className = 'key';
    key.textContent = field.key;
    label.append(text, key);
    wrap.append(label);

    const control = makeControl(field, entry[field.key]);
    if (field.type === 'poster') {
      const row = document.createElement('div');
      row.className = 'poster-row';
      const img = document.createElement('img');
      img.className = 'poster-preview';
      img.alt = '';
      const setPreview = url => {
        img.hidden = !url;
        if (url) img.src = url;
      };
      setPreview(entry[field.key] || '');
      control.addEventListener('input', () => setPreview(control.value.trim()));
      row.append(control, img);
      wrap.append(row);
    } else {
      wrap.append(control);
    }

    if (field.hint) {
      const hint = document.createElement('span');
      hint.className = 'field-hint';
      hint.textContent = field.hint;
      wrap.append(hint);
    }
    return wrap;
  }

  function readonlyRow(key, value) {
    const row = document.createElement('div');
    row.className = 'ro-row';
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    if (value == null || value === '') {
      dd.textContent = '—';
      dd.className = 'ro-empty';
    } else if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      const a = document.createElement('a');
      a.href = value;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = value;
      dd.append(a);
    } else {
      dd.textContent = String(value);
    }
    row.append(dt, dd);
    return row;
  }

  function platformSummary(name, data) {
    if (!data) return null;
    const parts = [`${data.episodeCount ?? '?'} ตอน`, data.updateStatus || ''];
    if (data.episodeSource === 'estimated_from_airing') parts.push('(ประมาณจากตารางฉาย)');
    return readonlyRow(name, `${parts.filter(Boolean).join(' · ')} — ${data.seriesUrl || ''}`);
  }

  function renderReadonlySection(entry) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'readonly';
    const legend = document.createElement('legend');
    legend.textContent = 'ข้อมูลจากระบบ (อ่านอย่างเดียว)';
    fieldset.append(legend);

    const hint = document.createElement('p');
    hint.className = 'section-hint';
    hint.textContent = 'field เหล่านี้ pipeline เขียนทับทุกรอบอัปเดต — แก้ที่นี่ไม่มีผลถาวร (ถ้าจำเป็นจริง ๆ ใช้แท็บ Raw JSON)';
    fieldset.append(hint);

    const grid = document.createElement('dl');
    grid.className = 'ro-grid';
    for (const key of READONLY_KEYS) grid.append(readonlyRow(key, entry[key]));

    const episodes = entry.availableEpisodes || [];
    const latest = episodes[0];
    grid.append(readonlyRow('availableEpisodes',
      episodes.length
        ? `${episodes.length} ตอนใน YouTube (ล่าสุด ตอนที่ ${latest.number} — ${latest.publishedAt || ''})`
        : 'ยังไม่มีตอน'));

    for (const [name, data] of [['crunchyroll', entry.crunchyroll], ['bilibili', entry.bilibili], ['netflix', entry.netflix]]) {
      const row = platformSummary(name, data);
      if (row) grid.append(row);
    }

    if (entry.anilistTitles) {
      const t = entry.anilistTitles;
      grid.append(readonlyRow('anilistTitles',
        [t.romaji, t.english, t.native].filter(Boolean).join(' / ')
        + (t.synonyms && t.synonyms.length ? ` (+${t.synonyms.length} synonyms)` : '')));
    }

    fieldset.append(grid);
    return fieldset;
  }

  function renderForm(entry) {
    formEl.textContent = '';
    if (draftEntry) {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = 'รายการใหม่';
      fieldset.append(legend);
      const grid = document.createElement('div');
      grid.className = 'field-grid';
      grid.append(makeField(ID_FIELD, entry));
      fieldset.append(grid);
      formEl.append(fieldset);
    }
    for (const section of SECTIONS) {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = section.title;
      fieldset.append(legend);
      if (section.hint) {
        const hint = document.createElement('p');
        hint.className = 'section-hint';
        hint.textContent = section.hint;
        fieldset.append(hint);
      }
      const grid = document.createElement('div');
      grid.className = 'field-grid';
      for (const field of section.fields) grid.append(makeField(field, entry));
      fieldset.append(grid);
      formEl.append(fieldset);
    }
    formEl.append(renderReadonlySection(entry));
  }

  // ---- form -> entry -------------------------------------------------------
  function convertValue(field, raw) {
    const value = raw.trim();
    switch (field.type) {
      case 'number': {
        if (value === '') return null;
        const num = Number(value);
        if (Number.isNaN(num)) throw new Error(`"${field.label}" (${field.key}) ต้องเป็นตัวเลข`);
        return num;
      }
      case 'csv':
        return value === '' ? [] : value.split(',').map(part => part.trim()).filter(Boolean);
      case 'lines':
        return raw.split('\n').map(line => line.trim()).filter(Boolean);
      case 'textarea':
        return raw.trim();
      default:
        return value;
    }
  }

  function entryFromForm() {
    const entry = JSON.parse(JSON.stringify(currentEntry()));
    const allFields = [ID_FIELD, ...SECTIONS.flatMap(section => section.fields)];
    for (const control of formEl.querySelectorAll('[data-key]')) {
      const field = allFields.find(f => f.key === control.dataset.key);
      const next = convertValue(field, control.value);
      // Don't invent keys the entry never had just because the input is empty.
      const isEmpty = next === null || next === '' || (Array.isArray(next) && next.length === 0);
      if (!(field.key in entry) && isEmpty) continue;
      entry[field.key] = next;
    }
    return entry;
  }

  function entryFromRaw() {
    let parsed;
    try {
      parsed = JSON.parse(rawEl.value);
    } catch (error) {
      throw new Error(`Raw JSON ไม่ถูกต้อง: ${error.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Raw JSON ต้องเป็น object ของอนิเมะ 1 เรื่อง');
    }
    return parsed;
  }

  function editedEntry() {
    return activeTab === 'raw' ? entryFromRaw() : entryFromForm();
  }

  // ---- tabs ----------------------------------------------------------------
  function switchTab(tab) {
    if (tab === activeTab) return;
    try {
      // Carry edits across: form -> raw serializes the form; raw -> form
      // re-renders the form from the parsed raw JSON.
      const entry = editedEntry();
      activeTab = tab;
      if (tab === 'raw') rawEl.value = `${JSON.stringify(entry, null, 2)}\n`;
      else renderForm(entry);
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
    for (const btn of document.querySelectorAll('.tab')) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    formEl.hidden = tab !== 'form';
    $('raw-panel').hidden = tab !== 'raw';
  }

  // ---- selection / loading -------------------------------------------------
  function selectAnime(id, force) {
    if (!force && !confirmDiscard()) return;
    draftEntry = null;
    currentId = id;
    const entry = currentEntry();
    setDirty(false);
    $('empty-state').hidden = true;
    $('editor-body').hidden = false;
    $('editor-title').textContent = entry.titleThai || entry.titleOriginal || entry.id;
    $('editor-id').textContent = `id: ${entry.id} · malId: ${entry.malId ?? '—'}`;
    renderForm(entry);
    rawEl.value = `${JSON.stringify(entry, null, 2)}\n`;
    if (activeTab === 'raw') switchTab('form');
    renderList();
  }

  function startNewEntry() {
    if (!confirmDiscard()) return;
    draftEntry = newEntryTemplate();
    currentId = null;
    setDirty(true);
    $('empty-state').hidden = true;
    $('editor-body').hidden = false;
    $('editor-title').textContent = 'เพิ่มเรื่องใหม่';
    $('editor-id').textContent = 'ยังไม่บันทึก — ตั้ง id แล้วกดบันทึกเพื่อเพิ่มลง data/anime.json';
    renderForm(draftEntry);
    rawEl.value = `${JSON.stringify(draftEntry, null, 2)}\n`;
    if (activeTab === 'raw') switchTab('form');
    renderList();
    const idInput = formEl.querySelector('[data-key="id"]');
    if (idInput) idInput.focus();
  }

  async function loadCatalog(keepSelection) {
    const response = await fetch('/api/anime');
    if (!response.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (HTTP ${response.status})`);
    const data = await response.json();
    items = data.items;
    hashes = data.hashes;
    $('catalog-meta').textContent = `${items.length} เรื่องใน data/anime.json`;
    renderList();
    if (keepSelection && currentId && currentEntry()) selectAnime(currentId, true);
  }

  // ---- saving ----------------------------------------------------------------
  async function save() {
    const creating = Boolean(draftEntry);
    if (!creating && !currentId) return;
    let entry;
    try {
      entry = editedEntry();
      if (creating && (typeof entry.id !== 'string' || !entry.id.trim())) {
        throw new Error('ต้องตั้ง id ก่อนบันทึกรายการใหม่');
      }
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
    const saveBtn = $('save-btn');
    saveBtn.disabled = true;
    try {
      const response = creating
        ? await fetch('/api/anime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entry })
          })
        : await fetch(`/api/anime/${encodeURIComponent(currentId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entry, baseHash: hashes[currentId] })
          });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (creating) {
        items.push(entry);
      } else {
        const index = items.findIndex(item => item.id === currentId);
        items[index] = entry;
      }
      hashes[entry.id] = result.hash;
      setDirty(false);
      selectAnime(entry.id, true);
      $('catalog-meta').textContent = `${items.length} เรื่องใน data/anime.json`;
      toast(creating
        ? `เพิ่ม "${entry.titleThai || entry.id}" ลง data/anime.json และ data/anime.js แล้ว`
        : 'บันทึกแล้ว — เขียน data/anime.json และ data/anime.js เรียบร้อย', 'ok');
    } catch (error) {
      toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  // ---- wiring ----------------------------------------------------------------
  $('search').addEventListener('input', renderList);
  $('new-btn').addEventListener('click', startNewEntry);
  $('save-btn').addEventListener('click', save);
  $('reload-btn').addEventListener('click', () => {
    if (!confirmDiscard()) return;
    loadCatalog(true).then(() => toast('โหลดข้อมูลล่าสุดจากไฟล์แล้ว', 'ok')).catch(error => toast(error.message, 'error'));
  });
  for (const btn of document.querySelectorAll('.tab')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }
  formEl.addEventListener('input', () => setDirty(true));
  rawEl.addEventListener('input', () => setDirty(true));
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', event => {
    if (dirty) event.preventDefault();
  });

  loadCatalog().catch(error => toast(error.message, 'error'));
})();
