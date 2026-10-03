# Roadmap

Proyek ini dibangun **satu fase pada satu waktu**. Fase berikutnya dimulai hanya setelah pemilik proyek memberi persetujuan eksplisit.

## Aturan kerja

1. Satu fase aktif. Tidak ada pekerjaan fase berikutnya "sambil jalan".
2. Sebuah fase dianggap **selesai** bila: `npm run check` hijau, `npm run build` berhasil, aplikasi berjalan lokal di Windows, dokumen diperbarui, dan tidak ada data atau API palsu.
3. Fitur yang butuh backend yang belum dibangun berbentuk **interface + `TODO(phase-N)`**, bukan stub yang berpura-pura bekerja.
4. Server adalah otoritas. Klien hanya mengirim intent ([ARCHITECTURE.md](ARCHITECTURE.md), bagian 7).
5. Semua aset, nama, peta, dan kode orisinal ([ORIGINALITY.md](ORIGINALITY.md)).

## Ringkasan

| Fase | Judul                          | Status                                                                                |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------- |
| 1    | Fondasi proyek                 | **Selesai**                                                                           |
| 1.5  | Fondasi arsitektur             | **Selesai**                                                                           |
| 2    | Rendering 2D                   | **Selesai**                                                                           |
| 3    | Pergerakan pemain              | **Selesai**                                                                           |
| 4    | Dunia, peta, dan tabrakan      | **Selesai**                                                                           |
| 5    | NPC dan monster                | Prototipe NPC + monster lokal selesai; AI/simulasi server-authoritative belum dimulai |
| 6    | Pertarungan                    | Belum dimulai                                                                         |
| 7    | Inventori, item, dan equipment | Belum dimulai                                                                         |
| 8    | Progresi karakter              | Belum dimulai                                                                         |
| 9    | Sistem quest                   | Belum dimulai                                                                         |
| 10   | Multiplayer WebSocket          | Belum dimulai                                                                         |
| 11   | Autentikasi dan basis data     | Belum dimulai                                                                         |
| 12   | Dunia persisten                | Belum dimulai                                                                         |
| 13   | Chat dan fitur sosial          | Belum dimulai                                                                         |
| 14   | Optimasi dan keamanan          | Belum dimulai                                                                         |
| 15   | Deployment                     | Belum dimulai                                                                         |

## Fase 1: Fondasi proyek (selesai)

**Isi:** monorepo (`apps/client`, `apps/server`, `packages/shared`); TypeScript ketat; ESLint (aturan yang memahami tipe, ditambah batas antar paket dan antar lapisan); Prettier; Vitest; server Fastify dengan `GET /api/health`, header keamanan, rate limit, graceful shutdown, dan konfigurasi env tervalidasi; klien Vite dengan layar boot yang menampilkan hasil pemeriksaan server **asli** (online, offline dengan retry berjeda, protokol tidak cocok); interface TODO (`AuthService`, `CharacterRepository`, `WorldRepository`, `GameConnection`); CI; dokumentasi.

**Bukti verifikasi (dijalankan di sandbox Linux, Node 22.22):**

| Pemeriksaan                                    | Hasil                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (typecheck, lint, format, tes) | Hijau. **94 tes**: shared 14, server 28, klien 52                                                                                            |
| `npm run build`                                | Server: `dist/main.js` 8 kB. Klien: JS 92 kB (27 kB gzip), CSS 3 kB                                                                          |
| `npm start` (bundel produksi)                  | `/api/health` 200 dengan header keamanan; log JSON; SIGTERM dan SIGINT menghasilkan "shutting down" lalu "shutdown complete", kode keluar 0  |
| Port dipakai                                   | Pesan jelas, kode keluar 1                                                                                                                   |
| Rate limit (soket nyata)                       | Permintaan ke-6 dengan batas 5 mendapat 429 + `retry-after`; rute 404 ikut dibatasi                                                          |
| `npm run dev`                                  | `/api/health` benar lewat proxy Vite (`:5173`) dan langsung (`:3001`); perubahan di `packages/shared` me-restart server secara rapi          |
| Browser nyata (Chromium 153)                   | 23 pemeriksaan lulus: Online, Offline lalu Retry, pemulihan otomatis, protokol tidak cocok, teks server berbahaya, keyboard, tampilan 390 px |
| Batas modul (ESLint)                           | 7 impor lintas-paket terlarang dan 10 impor lintas-lapisan terlarang ditolak; 3 impor sah tidak ditolak                                      |
| `npm audit`                                    | 0 kerentanan                                                                                                                                 |
| Berkas CI                                      | Lolos parser workflow resmi GitHub (0 galat), dan parser terbukti menolak workflow yang salah                                                |

**Belum diverifikasi (saat fase ini ditutup):** eksekusi di mesin **Windows** sungguhan (sandbox ini Linux) dan eksekusi CI di GitHub. Keduanya kemudian terbukti pada Fase 1.5 — lihat tabel bukti di bawah; bila ada masalah di mesin Anda, lihat [SETUP-WINDOWS.md](SETUP-WINDOWS.md).

## Fase 1.5: Fondasi arsitektur (selesai)

**Kenapa ada fase ini.** Fase 1 menghasilkan proyek yang bisa dijalankan, tetapi belum punya _entry point_, konfigurasi bersama, logging, atau penanganan error. Fase ini melengkapinya sebelum ada satu fitur permainan pun, supaya Fase 2-10 tumbuh di atas struktur yang jelas, bukan menumpuk di `main.ts` masing-masing sisi.

**Isi:**

- **Entry point.** `GameClient` (`apps/client/src/game/`) dan `GameServer` (`apps/server/src/game/`) sebagai _composition root_ dengan siklus hidup eksplisit; `main.ts` hanya merakit dan mengurus hal tingkat proses (env, sinyal, exit code).
- **Sistem konfigurasi.** `GameConfig` di `packages/shared` untuk angka yang wajib sama di kedua sisi; `AppConfig`/`ClientConfig` per aplikasi; skema zod, nilai default aman, objek beku, gagal cepat dengan pesan yang menyebut variabel keliru.
- **Variabel lingkungan.** Server: `.env` tervalidasi (variabel environment menang). Klien: hanya `VITE_LOG_LEVEL` yang sampai ke browser, divalidasi; `DEV_API_PROXY_TARGET`/`DEV_ALLOWED_HOSTS` hanya dibaca `vite.config.ts`.
- **Logging.** Level + _core_ logger di `shared/logging/` (satu kosakata, penyaringan sekali, `child()` bertitik); klien menulis ke console dengan Error asli, server memakai pino milik Fastify plus _startup logger_ untuk fase sebelum pino ada.
- **Penanganan error.** `RealmError` (kode stabil, context, cause) sebagai keluarga error aplikasi; `ApiError` tetap untuk kegagalan satu permintaan; `installGlobalErrorHandlers` di klien; `uncaughtException`/`unhandledRejection` di server; `FatalErrorScreen` saat klien gagal start.
- **Tipe bersama.** `PlayerState`/`PlayerId`/`PlayerNameSchema`, `Position`, `Direction`, dan tipe protokol (`MessageEnvelope`, `MessageRegistry`, `MessageOf`/`ClientIntent`/`ServerMessage`, `decodeMessageFrame`/`encodeMessageFrame`).
- **Struktur folder.** Lapisan `game/` di kedua aplikasi; `apps/server/src/app.ts` pindah ke `http/buildApp.ts`; `apps/client/src/app/startApp.ts` digantikan `game/GameClient.ts` + `main.ts`.

**Belum ada (sengaja):** renderer, input, simulasi, tick server, soket WebSocket, registry pesan nyata, akun, dan basis data. Perubahan kontrak yang tidak kompatibel tetap memerlukan kenaikan `PROTOCOL_VERSION`.

**Bukti verifikasi (dijalankan di sandbox Linux, Node 22.22.3):**

| Pemeriksaan                                       | Hasil                                                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (typecheck, lint, format, tes)    | Hijau. **206 tes**: shared 80, server 45, klien 81                                                                                                                                            |
| `npm run build`                                   | Server: `dist/main.js` 17,7 kB (sourcemap aktif). Klien: JS 99 kB (29 kB gzip), CSS 2,8 kB                                                                                                    |
| `npm start` (bundel produksi) + `npm run preview` | `/api/health` 200; `/api/nope` 404 dengan bentuk error standar; header `nosniff`/`X-Frame-Options`/`Referrer-Policy` ada; `SIGTERM` → "shutting down" → "game server stopped" → kode keluar 0 |
| `npm run dev`                                     | Server (`:3001`) dan klien (`:5173`) jalan bersama; `/api/health` benar lewat proxy Vite; log server `game server ready` memuat konfigurasi efektif                                           |
| Host header (dev server)                          | Nama host sandbox (`*.e2b.app`) diterima (200); nama host asing tetap ditolak 403 (perlindungan DNS-rebinding tidak dimatikan)                                                                |
| Siklus hidup `GameServer`                         | Tes nyata di port acak: start → `/api/health` via `fetch` → stop (koneksi ditolak) → start kedua ditolak `invalid_state`; port terpakai → `port_unavailable`                                  |
| Port dipakai                                      | Pesan menyebut nomor port dan langkah berikutnya; status akhir `stopped`, bukan `starting`                                                                                                    |
| Batas modul (ESLint)                              | Terbukti menggigit: impor `./app` dari lapisan `http` ditolak aturan pelapisan (dan berkas itu berganti nama menjadi `buildApp.ts`)                                                           |

**Belum diverifikasi:** eksekusi di mesin **Windows** sungguhan dan eksekusi CI di GitHub (sandbox ini Linux). Skrip tidak memakai sintaks khusus POSIX, `package-lock.json` memuat binary win32, dan matriks CI menyertakan `windows-latest`.

## Fase 2: Rendering 2D (selesai)

- **Tujuan:** menggambar dunia 2D di browser, tanpa ada fitur permainan yang ikut dibuat.
- **Yang dibangun:** renderer PixiJS 8 (WebGL) dengan loop berbasis delta time, kamera yang mengikuti pemain dan tidak keluar peta, koordinat dunia/layar, penanganan `devicePixelRatio` dan resize, sistem pemuatan aset dengan progres sungguhan, sistem lapisan (ground → objects → characters → npcs → effects → world-ui), satu zona prototipe, HUD debug, serta generator aset orisinal di repo ([ASSETS.md](ASSETS.md)).
- **Selesai bila:** area tile dengan sprite orisinal tampil lancar di desktop dan ponsel, dan loop render bisa dites tanpa browser — **terpenuhi**: 167 tes klien (21 berkas) berjalan di Node/happy-dom tanpa GPU, `npm run check` dan `npm run build` hijau.
- **Keputusan yang diminta sebelumnya:** renderer = **PixiJS 8** (disetujui pemilik proyek); aset = **skrip generator di repo** (bukan aset pihak ketiga); tes browser otomatis (Playwright) **ditunda** sesuai keputusan yang sama.

**Yang tidak dikerjakan (sengaja):** pertarungan, inventori, quest, basis data, dan multiplayer tidak disentuh di fase ini. Klien juga **tidak** berpura-pura punya dunia dari server: sesi dunia bersifat lokal, diberi label jelas di layar, dan hanya menyala setelah handshake `/api/health` berhasil.

| Yang diklaim                                  | Cara membuktikannya                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Kanvas 2D menampilkan dunia                   | `WorldStage` + `PixiRenderer`; tes `WorldStage.test.ts` (renderer palsu, tanpa GPU) menegakkan urutan init/tick/resize/stop     |
| Loop memakai delta time                       | `GameLoop` + `FixedTimestep` bersama; tes klien menutup kasus stall, delta negatif, dan fps tersaring                           |
| Kamera mengikuti pemain dan tidak keluar peta | `Camera` + `clampToMap`; tes `WorldSession.test.ts` dan `packages/shared/src/render/camera.test.ts`                             |
| Koordinat dunia dan layar terdefinisi         | `packages/shared/src/render/camera.ts` (`worldToScreen`, `screenToWorld`, `visibleTileRange`) + tesnya                          |
| Resize tidak merusak tampilan                 | `WorldStage.handleResize()` menyerahkan ukuran baru ke renderer **dan** kamera; dites                                           |
| `devicePixelRatio` ditangani                  | resolusi dibatasi `renderer.maxPixelRatio` (default 2); dites                                                                   |
| Pemuatan aset dasar                           | `AssetLoader` dengan `loadTexture` yang disuntikkan, progres nyata, dan validasi frame terhadap tekstur; dites                  |
| Lapisan render modular                        | `RENDER_LAYERS` + `RenderCommand` + `diffScene`; tes diff memastikan tak ada perintah yang dikirim untuk state yang tak berubah |
| Arsitektur siap untuk tilemap                 | `GameMapSchema` + `buildTileLayer` di `shared/protocol/world.ts` (kolom/baris, spawn, indeks tile ≥ -1) + tes                   |
| Tidak ada error saat render                   | typecheck, lint, dan 167 tes klien hijau; jalur kegagalan start menampilkan alasan dan membersihkan dirinya sendiri             |
| Aset orisinal, bukan dari game lain           | [ASSETS.md](ASSETS.md): semua piksel digambar `scripts/assets/*.mjs` dari palet proyek sendiri                                  |

**Catatan verifikasi:** tidak ada browser di sandbox pengembangan, jadi penerimaan di browser (dunia benar-benar terlihat, kamera terasa mengikuti, resize aman) dikonfirmasi pemilik proyek dengan membuka `npm run dev`; tes otomatis berbasis browser tetap ditunda.

## Fase 3: Pergerakan pemain (selesai)

- **Pilihan desain:** gerak lokal/offline yang dinyatakan jelas di layar; tidak menarik WebSocket lebih awal. Server tetap otoritas saat fase jaringan tiba.
- **Arah gerak:** empat arah kardinal, sesuai kontrak `Direction` dan empat baris sprite yang sudah dipakai renderer. Tombol WASD dan panah tersedia di desktop; D-pad sentuh yang sudah ada memakai intent yang sama. Arah yang paling baru ditekan aktif; melepasnya kembali ke tombol lain yang masih ditahan.
- **Pemisahan modul:** `input/InputController.ts` hanya mengubah event keyboard/touch menjadi `MoveIntent`; `game/PlayerController.ts` memiliki state pemain dan menerapkan intent; `shared/simulation/movement.ts` menghitung langkah posisi deterministik; `physics/Collision.ts` memeriksa posisi terhadap grid tanpa mengetahui detail controller atau renderer. `WorldSession` mengorkestrasi modul-modul tersebut dan mengirim state ke scene.
- **State pemain lokal:** `id`, `position`, `direction`, `movementState` (`idle`/`moving`), `speed` (4,2 tile/detik dari `GameConfig`) dan `animationState` (`idle`/`walk`). Posisi simulasi memakai fixed timestep 20 Hz; scene menginterpolasi antar-langkah untuk gambar yang stabil. Tanpa akselerasi/decelerasi: kecepatan konstan saat tombol ditahan, lalu berhenti pada langkah simulasi berikutnya setelah dilepas.
- **Tabrakan:** resolver tile-grid memeriksa area badan empat sudut, batas peta, dan menyapu langkah besar agar tidak menembus tile terhalang. Ini adapter minimal untuk dunia prototipe yang ada, bukan sistem format peta/tabrakan penuh (tetap Fase 4).
- **Tidak dikerjakan:** multiplayer, combat, akun/basis data, perubahan dunia/peta, atau fitur fase berikutnya.
- **Bukti:** `npm run check` hijau (**371 tes**: klien 188, server 45, shared 138); `npm run build` hijau untuk server dan klien. Tes `InputController`, `PlayerController`, fungsi gerak shared, `TileCollision`, `WorldSession` (gerak, stop, animasi, kamera, interpolasi, tabrakan) dan `WorldStage` mencakup jalur ini. Browser nyata tidak tersedia untuk verifikasi visual di sandbox; Playwright tetap ditunda.

## Fase 4: Dunia, peta, dan tabrakan (selesai)

- **Format dipilih:** format data sendiri yang JSON-friendly dan divalidasi zod di `packages/shared/src/protocol/world.ts`. Map menyimpan tile ID semantik (bukan nomor atlas), `TileData`, boundary, named areas, spawn points, tile layers, collision mask, object layer dan object colliders. Data yang lolos validasi punya ukuran grid konsisten dan referensi tile/area yang sah.
- **Map awal:** `Greenhaven` (`72x48`) ada sebagai world data bersama di `packages/shared/src/world/maps/greenhaven.ts`; map orisinal berisi Heartwood Grove, Bracken Meadow, Old Quarry, Moonmere Shore, Greenhaven Village, dan South Fields. Ada spawn pemain di village square dan titik spawn transisi bernama untuk akses/validasi lokasi.
- **Lapisan:** ground dan decoration menjadi scene tilemap yang diculling per chunk; collision layer tidak dikirim ke renderer; objects dirakit dari object-layer data. PixiJS hanya menerima scene data dan memetakan tile ID ke manifest aset—isi Greenhaven tidak di-hardcode di renderer.
- **Collision:** `TileCollision` membaca properti blokir tile (air dan stone wall), collision mask, object collider (rocks/cottages), dan map bounds. Gerak disapu dalam langkah kecil sehingga tidak menembus rintangan; kamera dibatasi ke boundary yang sama.
- **Area:** posisi pemain memilih area terdekat dan namanya ditampilkan di HUD; saat pemain berjalan melintasi area, HUD ikut berubah tanpa perpindahan ke map lain.
- **Server:** `GameServer` memuat dan memvalidasi Greenhaven dari paket shared saat startup. `ServerWorldMap` memakai `TileCollision` shared yang sama dengan klien untuk memeriksa posisi dan menyapu requested movement terhadap tile, collision mask, object collider, serta map bounds.
- **Batas scope saat Fase 4 ditutup:** server menyediakan map dan collision validator, tetapi belum menerima intent jaringan, mengelola player state, atau menjalankan world tick; otoritas gerak multiplayer tetap Fase 10. Format collision saat ini untuk objek statis; saat penutupan Fase 4, pekerjaan NPC, combat, database, dan fase berikutnya belum dimulai.
- **Bukti:** `npm run check` hijau (**390 tes**: klien 192, server 50, shared 148); `npm run build` hijau. Tes mencakup validasi schema, server load map dan gerak, tile/object collision, bounds, spawn, area lookup, camera clamp, multi-layer scene dan movement. Live preview tersedia; browser visual belum diverifikasi otomatis di sandbox.

## Fase 5: NPC dan monster

- **Prototipe NPC yang sudah dibangun:** NPC Greenhaven lokal dan data-driven untuk Village Elder, Merchant, dan Guard; role `merchant`/`quest_giver`/`generic`; proximity radius, tombol E/Talk, dialogue graph bercabang, dan UI percakapan. Lihat [ARCHITECTURE.md](ARCHITECTURE.md#20-prototipe-interaksi-npc-lokal-slice-fase-5).
- **Prototipe monster yang sudah dibangun:** Forest Slime, Wild Boar, dan Thorn Wolf adalah monster orisinal dengan spawn, statistik, rute patroli, AI IDLE/PATROL/CHASE/ATTACK, damage, HP/HURT/DEAD, cooldown, respawn, sprite, HUD, dan serangan pemain lewat Space/Attack. Entity, AI, combat, dan spawner terpisah; kontrak/data shared serta sesi/render klien teruji. Lihat [ARCHITECTURE.md](ARCHITECTURE.md#21-sistem-monster-lokal-slice-fase-5).
- **Scope prototipe ini:** NPC, monster, combat, HUD, dan respawn berjalan lokal di browser. Tidak ada transaksi merchant, quest completion, database, atau persistence; server belum otoritas atas NPC/monster.
- **Masih terbuka untuk Fase 5 penuh:** entitas dan simulasi monster di server, AI/pathfinding dan aturan spawn/respawn server-authoritative, sinkronisasi state ke klien, serta NPC yang tampil/bergerak dari data server.
- **Selesai bila:** monster dan NPC tampil dari data server dan bergerak sesuai aturan server; klien hanya mengirim intent dan tidak menentukan hasil AI/combat.
- **Bukti prototipe lokal (sandbox Linux, Node 22.22.3):** `npm run check` hijau — **427 tes** (klien 219, server 50, shared 158); `npm run build` berhasil untuk server dan klien produksi. Ini memverifikasi slice lokal, bukan kriteria Fase 5 penuh; uji visual browser Windows/nyata belum tercatat.

## Fase 6: Pertarungan

- **Isi:** serangan sebagai intent; server menghitung jarak, cooldown, damage (RNG di server), kematian, respawn, dan pemberian EXP; log kejadian tempur.
- **Aturan keras:** klien tidak pernah menghitung hasil tempur.

## Fase 7: Inventori, item, dan equipment

- **Isi:** definisi item (data); operasi inventori sebagai intent; slot equipment; loot dengan RNG server; UI overlay.
- **Perlu diputuskan:** framework UI overlay; definisi `Item` sebagai data statis atau tabel basis data.

## Fase 8: Progresi karakter

- **Isi:** kurva EXP dan level; statistik dan statistik turunan; kejadian naik level.

## Fase 9: Sistem quest

- **Isi:** definisi quest; pelacakan tujuan di server; hadiah; interaksi NPC.
- **Entitas:** progres quest masuk ke agregat karakter yang disimpan.

## Fase 10: Multiplayer WebSocket

- **Isi:** gateway WebSocket; protokol bertingkat versi di `packages/shared` dengan validasi zod untuk **setiap** pesan; tick server; snapshot atau delta; _interest management_; prediksi dan rekonsiliasi di klien; implementasi `GameConnection` dengan reconnect (tambahkan jitter pada backoff); rate limit per koneksi; pemeriksaan `Origin`; batas koneksi per IP.
- **Perlu diputuskan:** frekuensi tick dan format pesan.

## Fase 11: Autentikasi dan basis data

- **Isi:** PostgreSQL, migrasi, akun, Argon2id, sesi server-side di cookie `HttpOnly`, perlindungan CSRF (cek `Origin`), rate limit login per IP dan per username; implementasi `AuthService`; layar login, pembuatan, dan pemilihan karakter.
- **Entitas:** User, Character, Inventory, Equipment, Item, Quest.
- **Perlu diputuskan:** lapisan akses basis data; cara menjalankan basis data secara lokal di Windows dengan mudah.

## Fase 12: Dunia persisten

- **Isi:** simpan dan muat karakter dalam **satu transaksi**; autosave; keamanan saat crash; implementasi `CharacterRepository` dan `WorldRepository`.
- **Perlu diputuskan:** apa saja yang persisten di dunia (item jatuh, flag NPC/quest, kejadian dunia). Posisi monster dan timer respawn biasanya dibangun ulang dari data peta.

## Fase 13: Chat dan fitur sosial

- **Isi:** kanal chat, daftar pemain, interaksi antar pemain; rate limit dan sanitasi di server.

## Fase 14: Optimasi dan keamanan

- **Isi:** profiling, uji beban, hemat bandwidth, heuristik anti-curang, CSP untuk klien, tinjauan keamanan menyeluruh, audit dependensi rutin di CI, penilaian ulang ukuran bundel.

## Fase 15: Deployment

- **Isi:** container, reverse proxy dengan TLS, hosting klien statis, manajemen secret dan env, pencadangan basis data, CI/CD, pemantauan.

## Bagaimana kita menyentuh fase berikutnya

Saat Anda menyetujui fase berikutnya, langkah pertamanya adalah: membaca ulang bagian fase itu di sini, memverifikasi ulang versi pustaka kandidat ke registri, menjawab bagian **Perlu diputuskan** bersama Anda, lalu mengerjakan hanya fase itu.
