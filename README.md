# Anime TV Catalog — Thai YouTube Tracker

Static website สำหรับแสดงอนิเมะ TV ทั้งปีจาก Jikan พร้อมติดตามตอนจากช่อง YouTube ลิขสิทธิ์ไทย และช่องทางรับชมบน Crunchyroll และ Bilibili TV

## วิธีเปิด

เปิดไฟล์ `index.html` ได้เลย ไม่ต้องติดตั้ง Node.js หรือแพ็กเกจใด ๆ

## โครงสร้าง

- `index.html` — หน้าเว็บหลัก
- `styles.css` — ธีม anime 2000s + glassmorphism + responsive
- `app.js` — search/filter/modal/schedule
- `data/anime.json` — ข้อมูลสำหรับนำไปใช้กับ backend/API ในอนาคต
- `data/anime.js` — ข้อมูลแบบฝังสำหรับเปิดแบบ file:// ได้ทันที
- `data/youtube-channels.json` — allowlist ช่อง YouTube ลิขสิทธิ์ที่ใช้ค้นตอนใหม่
- `data/youtube-discovery-state.json` — state สำหรับ incremental scan
- `assets/posters/*.svg` — poster placeholder ที่สร้างขึ้นเอง ไม่ใช่ official key visual

## อัปเดตข้อมูลตอนล่าสุดในเครื่อง

ต้องใช้ Node.js 22 และ YouTube Data API v3 key สร้าง key ได้จาก Google Cloud Console โดยเปิดใช้ YouTube Data API v3 ก่อน จากนั้นตั้ง environment variable และรัน:

```powershell
$env:YOUTUBE_API_KEY='your-api-key'
node tools/update-youtube.js
node tools/discover-youtube.js
```

อัปเดตช่องทางรับชม Crunchyroll และ Bilibili TV (ดึงจาก AniList API — ไม่ต้องใช้ key):

```powershell
node tools/update-streaming-platforms.js
```

สคริปต์นี้ค้นด้วย `malId` ของแต่ละเรื่อง แล้วเขียน field `crunchyroll` และ `bilibili` (ลิงก์ซีรีส์ + รายการตอน) ลงข้อมูลจากการเรียก AniList เพียงครั้งเดียวต่อรายการ (ข้อมูล external link ของทุกแพลตฟอร์มมาในคำตอบเดียวกันอยู่แล้ว) เรื่องที่มีตอนบนแพลตฟอร์มใดแพลตฟอร์มหนึ่งจะถูกนับเป็น "ดูได้แล้ว" ตามลำดับความสำคัญ YouTube > Crunchyroll > Bilibili — หมายเหตุ: `Bilibili TV` (bilibili.tv) คือบริการสตรีมมิงลิขสิทธิ์สากล/เอเชียตะวันออกเฉียงใต้ที่มีซับไทย ซึ่งต่างจาก `bilibili.com` (เว็บจีนแผ่นดินใหญ่ที่มี user upload) ที่ระบบนี้จะไม่ดึงข้อมูลมาเด็ดขาด ข้อมูลทั้งสองแพลตฟอร์มสะท้อนการมีให้ดูในระดับสากลเท่านั้น โปรดตรวจสอบซับไทยในแอปอีกครั้ง

สคริปต์จะอ่าน `data/anime.json` ตรวจทุกหน้าใน playlist แล้วเขียนทั้ง `data/anime.json` และ `data/anime.js` ใหม่ หากไม่มี key สคริปต์จะจบด้วยข้อความ error ที่ชัดเจน

แต่ละรายการจะมี `availableEpisodes` ซึ่งเก็บตอนที่ตรวจพบจาก YouTube Playlist พร้อมหมายเลข ชื่อ วิดีโอ URL และวันเผยแพร่ หน้าเว็บจะแสดง 10 ตอนล่าสุดใน modal และโหลดตอนย้อนหลังเพิ่มครั้งละ 10 ตอน

รัน unit tests ของตัวตรวจจับตอนด้วย:

```powershell
node --test tools/*.test.js
```

## การเพิ่มอนิเมะ

เพิ่ม object ใหม่ใน `data/anime.json` โดยคง field เดิมของรายการอื่นไว้ กำหนด `id` ไม่ให้ซ้ำ และใส่ URL ใน `link` ถ้าเป็น playlist URL ที่มี `list=...` สคริปต์จะดึง `playlistId` ให้อัตโนมัติ หรือใส่ `playlistId` โดยตรงก็ได้ จากนั้นรัน updater เพื่อสร้างสถานะตอนล่าสุดและ sync ไฟล์ JavaScript

## Export รายการสำหรับให้ agent ค้น YouTube

รัน `node tools/export-youtube-research.js` เพื่อสร้าง `data/youtube-research-queue.json` ซึ่งรวมอนิเมะ TV ปีปัจจุบัน พร้อมช่องสำหรับกรอก Playlist, URL รายตอน, aliases, ช่องทางทางการ และแหล่งอ้างอิง โดยต้องรักษา `id` และ `malId` เดิมไว้สำหรับ import กลับอย่างปลอดภัย

เมื่อ agent กรอกผลวิจัยกลับมาแล้ว นำเข้าได้ด้วยคำสั่ง:

```powershell
node tools/import-youtube-research.js "C:\path\to\youtube-research-queue.updated.json"
```

ตัว import จะตรวจว่า `id` และ `malId` ตรงกับ catalog, รวม aliases/หลักฐาน/URL รายตอน, และไม่เขียนทับ Playlist เดิมหากรหัสขัดแย้งกัน จากนั้น sync `data/anime.json`, `data/anime.js` และสำเนา research queue ให้อัตโนมัติ

## GitHub Actions

เพิ่ม repository secret ชื่อ `YOUTUBE_API_KEY` ที่ Settings → Secrets and variables → Actions งาน `Update anime episodes` รันทุกวันเวลา 05:17 น. ประเทศไทย โดย sync Jikan, Playlist และ uploads ของช่องใน allowlist ตามลำดับ การสั่งงานด้วยตนเองเลือก `backfill` เพื่อสแกนย้อนหลังถึง 1 มกราคมได้

## Deploy ด้วย GitHub Pages

Repository มี workflow `Deploy GitHub Pages` ซึ่ง deploy หน้าเว็บเมื่อ branch `main` เปลี่ยน และถูกเรียกต่อหลัง workflow อัปเดตข้อมูลสำเร็จ ตั้งค่าครั้งแรกดังนี้:

1. สร้าง public repository และ push โครงการขึ้น branch `main`
2. ที่ Settings → Pages เลือก Source เป็น **GitHub Actions**
3. ที่ Settings → Secrets and variables → Actions เพิ่ม secret ชื่อ `YOUTUBE_API_KEY`
4. ที่ Settings → Actions → General เปิด Workflow permissions เป็น **Read and write permissions**
5. รัน workflow `Update anime episodes` แบบ manual โดยเลือก `backfill` สำหรับรอบแรก

API key ต้องเก็บใน GitHub Actions secret เท่านั้น ห้ามใส่ใน `app.js`, ไฟล์ข้อมูล หรือ commit ลง repository

## ดึงรายชื่อและโปสเตอร์จาก Jikan

รัน `node tools/update-jikan.js` เพื่อดึงอนิเมะประเภท TV ของปีปัจจุบันครบ Winter, Spring, Summer และ Fall สคริปต์จะลบรายการซ้ำด้วย `mal_id`, เก็บปีก่อนเป็น archive และไม่เขียนทับ Playlist หรือตอน YouTube เดิม

เวลาออกอากาศจาก Jikan จะถูกแปลงจาก JST เป็นเวลาไทยและใช้สร้าง “ตารางฉายวันนี้” บนหน้าแรกตาม timezone `Asia/Bangkok`

## หมายเหตุ

- YouTube Data API ไม่สามารถยืนยัน subtitle track ได้เสมอไป หากไม่ได้รับสิทธิ์จากเจ้าของช่อง
- การตรวจจาก playlist เชื่อถือได้กว่าการค้นหาวิดีโอทั่วไป
- การกรอง trailer, PV และสื่อโปรโมตเป็น heuristic จึงอาจต้องปรับ pattern เมื่อรูปแบบชื่อเปลี่ยน
- Channel discovery จับคู่เฉพาะชื่อที่ตรงแบบ strong unique match; ผลกำกวมเก็บใน `data/youtube-candidates.json`
