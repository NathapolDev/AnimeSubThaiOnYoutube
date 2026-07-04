# บันทึกการแก้บัคและปรับปรุง — 3 ก.ค. 2026

บันทึกจากการตรวจโค้ดทั้ง repository (frontend, tools, workflow, data) บน branch `claude/bug-fixes-redesign-k1stpq`

## บัคที่พบและแก้ไขแล้ว

### ข้อมูล (data/anime.json)
1. **`polar-opposites-2` ถือข้อมูล MAL ของอนิเมะเรื่องอื่น** — entry นี้ถูกกรอก `malId: 54000` ผิดมาตั้งแต่ commit แรก (54000 คือ Otome Game Sekai wa Mob ni Kibishii Sekai desu 2) ทำให้ pipeline Jikan ดึงข้อมูล premiere / score / rating / สถานะของเรื่องผิดมาเขียนทับทุกรอบ → ล้าง `malId`, `malUrl` และ field ที่มาจากเรื่องผิดออก คืนค่า premiere ตามข้อมูล manual เดิม และจดใน `note` ให้รอ sync จับคู่ใหม่ตามชื่อเรื่อง

### tools/
2. **`update-youtube.js` ไม่มี retry เมื่อ YouTube API ล่มชั่วคราว** — โดน 429 (rate limit) หรือ 5xx ครั้งเดียว อนิเมะเรื่องนั้นถูก mark `updateStatus: 'error'` ทันที → เพิ่ม retry + backoff สูงสุด 5 ครั้ง (แบบเดียวกับที่ update-jikan มีอยู่แล้ว)
3. **`discover-youtube.js` ไม่มี retry เช่นกัน** → ใช้ helper `youtubeJson` ตัวเดียวกัน
4. **`episodeNumber()` ตีความ hashtag ปีเป็นเลขตอน** — ชื่อวิดีโอที่มี `#2026` จะถูกอ่านเป็น "ตอนที่ 2026" → ตัวเลขจาก pattern ที่ ≥ 1900 จะถูกข้าม
5. **`import-youtube-research.js` ยุบ entry ที่ไม่มี `malId` ลง key `NaN` เดียวกันใน Map** — `Number(undefined)` = NaN ทำให้ entry แบบ manual ทุกตัวชนกันเอง ผลตรวจ conflict เชื่อถือไม่ได้ → สร้าง map เฉพาะ malId ที่เป็นตัวเลขจริง และ entry ที่ทั้งสองฝั่งไม่มี malId ให้จับคู่ด้วย `id` อย่างเดียว

### GitHub Actions
6. **`update-anime.yml` push แบบไม่ rebase** — ถ้ามี commit อื่นเข้า main ระหว่าง workflow รัน (~หลายนาที) `git push` จะ fail และข้อมูลที่อัปเดตมาทั้งรอบหายทิ้ง → เพิ่ม loop `git pull --rebase` + retry สูงสุด 3 ครั้ง และเพิ่ม `timeout-minutes: 30`

### Frontend (แก้พร้อมงาน redesign ใน app.js/index.html/styles.css)
7. **คำนวณเวลาไทยด้วย `new Date(new Date().toLocaleString(...))`** — การ parse string แบบนี้ไม่รับประกันผลบน Safari/บาง locale → เปลี่ยนเป็น `Intl.DateTimeFormat(...).formatToParts()`
8. **ตารางรายสัปดาห์เรียงด้วย `localeCompare` ทั้ง string** — วันถูกเรียงตามตัวอักษรไทย (ศุกร์มาก่อนอาทิตย์ ฯลฯ) และรายการ "รอประกาศเวลาไทย" แทรกปนมั่ว → จัดกลุ่มตามวันจริง เริ่มจากวันนี้ เรียงเวลาแบบตัวเลข แยกกลุ่ม "รอประกาศเวลาไทย" ท้ายสุด
9. **ตารางวันนี้เรียงเวลาแบบ string compare** — `"9:30" > "15:30"` → เรียงด้วยนาทีแบบตัวเลข
10. **`item.channel.includes(...)` พังทั้ง grid ถ้า entry ใดไม่มี `channel`** → ทำ helper null-safe
11. **โปสเตอร์ว่างทำให้ `<img src="">` ยิง request ใส่หน้าตัวเอง** → ไม่ render `<img>` เมื่อไม่มีรูป แสดง fallback แทน
12. **ปุ่มดูวิดีโอ href="#" เปิดแท็บใหม่เปล่า ๆ** เมื่อ URL ไม่ผ่าน allowlist → แสดงเป็นปุ่ม disabled แทน
13. **กด Enter บนลิงก์ในการ์ดแล้ว dialog เปิดซ้อน** — keydown bubble ขึ้นไปที่การ์ด → เช็ค event.target ก่อนเปิด
14. **ธีมไม่จำค่า และไม่ตามการตั้งค่าระบบ** → เก็บ localStorage + ค่าเริ่มต้นตาม `prefers-color-scheme`
15. **ไม่มี favicon (404 ทุก page load)** → เพิ่ม favicon แบบ inline SVG data URI

## ฟีเจอร์ใหม่ (จากงาน redesign)
- ★ รายการโปรด (เก็บใน localStorage) + ชิปกรองเฉพาะรายการโปรด
- เรียงลำดับ: อัปเดตล่าสุด / คะแนน MAL / วันเริ่มฉาย / ชื่อเรื่อง
- Deep link `#a=<id>` เปิด dialog รายละเอียดได้ทันที + ปุ่มคัดลอกลิงก์แชร์
- แถบสถิติรายปี (จำนวนเรื่อง / มีซับไทย / จำนวนตอน / อัปเดตใน 48 ชม.)
- ชิปช่องทางสร้างจากข้อมูลจริงอัตโนมัติ (ของเดิม hardcode 3 ช่อง)
- Badge "ตอนใหม่" (ภายใน 48 ชม.), badge คะแนน MAL, แถบ progress ตอนที่ฉายแล้ว
- dialog รายละเอียดเพิ่ม วันเริ่มฉาย / เวลาไทย / สตูดิโอ / คะแนน / ลิงก์ตัวอย่าง / ลิงก์ MAL
- ตารางรายสัปดาห์แบบจัดกลุ่มรายวัน ไฮไลต์วันนี้
- ปรับ accessibility: skip link, focus-visible, aria ครบ

## การปรับ performance
- `data/anime.js` เขียนแบบ minified ผ่าน `tools/write-data.js` (876KB → 759KB)
- Deploy ขึ้น GitHub Pages ผ่าน `tools/build-site-data.js` ตัด field ที่หน้าเว็บไม่ใช้ (**payload จริงเหลือ 603KB, gzip ~142KB**)
- `<script defer>` ทั้งสามไฟล์ + `preconnect` ไปยัง cdn.myanimelist.net
- การ์ดใช้รูปโปสเตอร์ขนาดกลางของ MAL (ตัด suffix `l`) — โหลดเบากว่ารูปใหญ่มาก, รูปใหญ่ใช้เฉพาะใน dialog
- `loading="lazy"` + `decoding="async"` กับโปสเตอร์ทั้งหมด
- เลิกใช้ `backdrop-filter: blur` เกือบทั้งหมดและย้าย gradient พื้นหลังไป fixed pseudo-element (scroll ลื่นขึ้นชัดเจนบนมือถือ)
- Debounce ช่องค้นหา + event delegation แทนการ attach listener รายการ์ด

---

# ตามแก้เพิ่ม — 4 ก.ค. 2026 (branch `claude/episode-numbering-fix-376bxv`)

## แถบ progress ตอน แสดง `77/19` (นับผิด)
- การ์ดเอา "เลขตอนล่าสุด" (`currentEpisode` เช่น Re:Zero ตอน 77 ที่นับต่อเนื่องข้ามซีซั่น) มาหารกับจำนวนตอนรวมของซีซั่น แทนที่จะเป็น "จำนวนตอนที่มีจริงบน YouTube" → แสดง `77/19`
- เดิมเคยแพตช์ด้วย `progress-fix.js` (overlay ตอน runtime) แต่ `deploy-pages.yml` ไม่ได้ copy ไฟล์นี้เข้า `_site/` → บนเว็บจริงโหลด 404 ไม่เคยทำงาน
- แก้ที่ต้นทาง: เพิ่ม `progress.js` (ฟังก์ชัน `episodeProgress()` = `min(availableEpisodes.length, episodes)`) เรียกใน `cardTemplate` ของ `app.js`, โหลดใน `index.html` และ copy ใน `deploy-pages.yml`, ลบ `progress-fix.js` + เทสเดิม, เพิ่ม `tools/progress.test.js`

## โปสเตอร์ไม่ตรงชื่อเรื่อง — `polar-opposites-2` (Seihantai na Kimi to Boku S2)
- เป็นบัคเดิมข้อ 1 ที่กลับมาอีก: ตอนนั้นบันทึกว่า "ล้างข้อมูล MAL" แต่จริง ๆ `malId: 54000` กับ `malUrl` ยังค้างอยู่ในไฟล์ → `update-jikan.js` จับคู่ด้วย `malId` ก่อน (findExisting) แล้วเขียนทับ `poster`/`studio`/`source`/`premiere` จากเรื่องผิด (Trapped in a Dating Sim) ทุกรอบ → การ์ดโชว์โปสเตอร์ 「乙女ゲー世界はモブに厳しい世界です」, สตูดิโอ ENGI
- id 54000 เดียวกันนี้ยังทำให้ Jikan สร้าง entry ซ้ำ `seihantai-na-kimi-to-boku-2nd-season` (malId 63832 ที่ถูกต้อง แต่ไม่มีลิงก์ YouTube) → เรื่องเดียวโผล่ในแคตตาล็อกสองใบ
- แก้: บน `polar-opposites-2` ตั้ง `malId` เป็น `63832` และแก้ `malUrl`/`poster`/`studio`/`source`/`genres`/`premiere` ให้ตรงกับ 63832 (เก็บข้อมูล YouTube/ตารางไทยไว้เหมือนเดิม), ลบ entry ซ้ำทิ้ง, regenerate `anime.js` ผ่าน `tools/write-data.js`
- กันซ้ำในอนาคต: เพิ่ม `tools/anime-data.test.js` ตรวจทั้งไฟล์ว่า malUrl id ตรงกับ malId, slug ของ malUrl แชร์คำกับชื่อเรื่องอย่างน้อย 1 คำ (จับกรณี malId ชี้ผิดเรื่อง), malId/id ไม่ซ้ำกัน
