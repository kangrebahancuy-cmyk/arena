# Project Realm

> **Project Realm** adalah nama sementara untuk sebuah MMORPG 2D berbasis browser yang **100% orisinal**: real-time, dunia persisten, server sebagai otoritas. Terinspirasi oleh genre MMORPG klasik, tanpa menyalin aset, nama, peta, kode, atau UI dari game mana pun ([kebijakan orisinalitas](docs/ORIGINALITY.md)).

**Fase 1, 1.5, 2, 3, dan 4 selesai.** Ada prototipe lokal untuk NPC dan monster (slice Fase 5): Village Elder, Merchant, dan Guard memakai dialog graph orisinal; Forest Slime, Wild Boar, dan Thorn Wolf memiliki AI `IDLE/PATROL/CHASE/ATTACK/HURT/DEAD`, HP, serangan, serta respawn berbasis data. **E** untuk bicara, **Space** untuk menyerang, dan tombol sentuh tersedia. Greenhaven (72×48), seluruh NPC, monster, statistik, dialog, dan rute patroli berasal dari data shared, bukan renderer. Gerak pemain empat arah, collision tile/object, dan kamera tetap lokal. Ini belum multiplayer: belum ada AI/otoritas monster di server, login, persistensi atau database; belum ada quest completion atau transaksi toko; aset masih _programmer art_ ([roadmap](docs/ROADMAP.md), [aset](docs/ASSETS.md)).

## Apa yang sudah nyata, dan apa yang belum

| Sudah ada dan teruji                                                                                                                                                                                                                                                                        | Belum ada (sengaja)                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GameServer` (entry point server) di atas Fastify: `GET /api/health`, header keamanan, rate limit, graceful shutdown, konfigurasi env tervalidasi; memuat Greenhaven dan menyediakan collision validator shared                                                                             | World tick dan otoritas server untuk gerak/AI/combat (Fase 5, 6, 10), inventori, dan quest (Fase 7, 9) |
| `GameClient` (entry point klien) + layar boot yang menampilkan hasil pemeriksaan server **sungguhan**: online, offline (retry otomatis), protokol tidak cocok                                                                                                                               | WebSocket multiplayer (Fase 10)                                                                        |
| Kontrak bersama (zod) di `packages/shared`: HTTP, `GameConfig`, `PlayerState`, pesan protokol, schema map/NPC/dialogue/monster, collision, dan data Greenhaven                                                                                                                              | Akun, login, basis data, penyimpanan karakter dan dunia (Fase 11-12)                                   |
| **Renderer 2D (Fase 2):** PixiJS 8 (WebGL), loop berbasis delta time, kamera mengikuti pemain dan dijepit ke peta, resize + `devicePixelRatio`, pemuatan aset dengan progres nyata, layer ground/decoration/objects/characters/npcs/monsters/effects/world-ui, culling per chunk, HUD debug | Chat dan sosial, optimasi, deployment (Fase 13-15)                                                     |
| **Gerak pemain lokal (Fase 3):** WASD/panah dan D-pad, gerak empat arah, speed 4,2 tile/detik, interpolasi, state idle/walk; Input, PlayerController, Movement, Physics/Collision terpisah                                                                                                  | Multiplayer/otoritas gerak server, belum ada (Fase 10)                                                 |
| **World system (Fase 4):** map Greenhaven 72×48 dengan ground, decoration, collision, object, spawn points, bounds, enam area; collision tile/object terpisah dari renderer                                                                                                                 | Perpindahan antar-map, tick dunia, dan otoritas gerak jaringan belum dibangun (Fase 10)                |
| **NPC + monster lokal:** 3 karakter dengan dialog bercabang; 3 monster original dengan spawn, patrol, chase/attack AI, HP/damage/death/respawn; sistem entity/AI/combat/spawner terpisah; Space menyerang, HUD menampilkan HP                                                               | Server AI/otoritas monster, quest completion, transaksi merchant, persistence, dan database belum ada  |
| **Aset orisinal** dari generator di repo (`npm run assets`): tile, objek, karakter/NPC/monster, efek - semuanya _programmer art_, bukan seni final ([ASSETS.md](docs/ASSETS.md))                                                                                                            | Seni final, animasi pertarungan, dan atlas yang dioptimalkan (setelah ada seniman)                     |
| Sistem konfigurasi berlapis + variabel lingkungan tervalidasi, logging terstruktur (satu fasada untuk klien dan server), penanganan error bertipe                                                                                                                                           | -                                                                                                      |
| Lint (termasuk aturan pelapisan), format, **427 tes** (klien 219, server 50, shared 158), CI (Ubuntu dan Windows)                                                                                                                                                                           | -                                                                                                      |

Fitur yang belum dibangun berbentuk **interface bertanda `TODO`** di kode (`AuthService`, `CharacterRepository`, `WorldRepository`, `GameConnection`). Tipe protokol realtime sudah ada di `packages/shared/src/protocol/`, tetapi **belum ada soket dan belum ada satu pun pesan permainan** — registry pesan ditulis di Fase 10. **Tidak ada data atau API palsu:** klien dan GameServer memuat MapData Greenhaven yang sama; server sudah memvalidasi posisi/gerak terhadap collision, tetapi belum menerima intent jaringan, menjalankan world tick, atau mengelola player state. Layar boot hanya menampilkan apa yang benar-benar dijawab server.

## Mulai cepat di Windows

Perintah yang sama berlaku di **Command Prompt** maupun **PowerShell**.

**1. Pasang Node.js dan Git** (sekali saja, lalu **buka terminal baru**):

```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

**2. Ambil kode dan jalankan:**

```
git clone https://github.com/kangrebahancuy-cmyk/arena.git
cd arena
npm install
npm run dev
```

**3. Buka http://localhost:5173** di browser. Kartu "System check" akan menunjukkan server **Online**, lalu Greenhaven terbuka: berjalanlah dengan **WASD, panah, atau D-pad**; saat dekat monster tekan **Space** atau **Attack**, dan saat dekat NPC tekan **E** atau **Talk** lalu pilih balasan. **Esc** menutup dialogue. **+**/**-** mengubah zoom, **0** mereset zoom, dan **P** mengganti penajaman piksel. HUD menunjukkan HP pemain serta status monster. Hentikan dengan **Ctrl+C**.

Aset prototipe sudah ikut di repo; kalau Anda ingin mengubah gambarnya, jalankan `npm run assets` dan muat ulang halaman.

Butuh Node.js **22.13 atau lebih baru** (`node -v`). Ada masalah? Lihat [panduan Windows](docs/SETUP-WINDOWS.md): kebijakan eksekusi PowerShell, port yang dicadangkan Windows (`EACCES`), firewall, `EBADENGINE`, WSL, dan membuka dari ponsel.

## Perintah

| Perintah                            | Fungsi                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                       | Server (`:3001`) dan klien (`:5173`) sekaligus, muat ulang otomatis             |
| `npm run check`                     | Typecheck, lint, cek format, dan semua tes (jalankan sebelum commit)            |
| `npm test`                          | Semua tes                                                                       |
| `npm run build`                     | Build produksi: `apps/server/dist` dan `apps/client/dist`                       |
| `npm run assets`                    | Membuat ulang aset prototipe dari `scripts/assets/` (deterministik)             |
| `npm start`                         | Menjalankan server hasil build (hanya API)                                      |
| `npm run preview`                   | Menyajikan klien hasil build di `:4173` (jalankan `npm start` di terminal lain) |
| `npm run lint:fix`                  | Memperbaiki masalah lint otomatis                                               |
| `npm run format`                    | Merapikan format semua berkas                                                   |
| `npm run clean`                     | Menghapus hasil build. Tambahkan `-- --deps` untuk menghapus `node_modules`     |
| `npm run dev:server` / `dev:client` | Menjalankan salah satu sisi saja                                                |

## Struktur

```
arena/
├─ apps/
│  ├─ client/    Klien browser (Vite + TypeScript): main.ts -> game/GameClient
│  └─ server/    Server otoritatif (Fastify + TypeScript): main.ts -> game/GameServer
├─ packages/
│  └─ shared/    Kontrak klien-server: konstanta, GameConfig, PlayerState,
│                pesan protokol, MapData/NPC/monster Greenhaven, log, error, skema zod
├─ docs/         Arsitektur, teknologi, roadmap, panduan Windows, orisinalitas
├─ scripts/      Generator aset orisinal dan alat repo
└─ .github/      CI
```

Dependensi mengalir satu arah (klien: `main → game → ui → boot → net → core`; server: `main → game → http → config/core/ports`), dan ESLint menggagalkan `npm run check` bila dilanggar. Penjelasan lengkap: [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Konfigurasi

Semuanya opsional; bawaannya aman. Untuk mengubah, salin template (berkas `.env` diabaikan git):

```
copy apps\server\.env.example apps\server\.env
copy apps\client\.env.example apps\client\.env
```

Di PowerShell: `Copy-Item apps\server\.env.example apps\server\.env`.

| Variabel (server)           | Bawaan      | Keterangan                                                     |
| --------------------------- | ----------- | -------------------------------------------------------------- |
| `HOST`                      | `127.0.0.1` | Hanya komputer ini. Pakai `0.0.0.0` hanya di belakang firewall |
| `PORT`                      | `3001`      | Jika diubah, ubah juga `DEV_API_PROXY_TARGET` di `apps/client` |
| `LOG_LEVEL`                 | `info`      | `trace` sampai `fatal`, atau `silent`                          |
| `TRUST_PROXY`               | `false`     | `true` hanya di belakang reverse proxy milik sendiri           |
| `HTTP_RATE_LIMIT_MAX`       | `120`       | Permintaan per IP per jendela waktu                            |
| `HTTP_RATE_LIMIT_WINDOW_MS` | `60000`     | Minimal 1000                                                   |

| Variabel (klien)       | Bawaan                         | Keterangan                                                                               |
| ---------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `VITE_LOG_LEVEL`       | `debug` (dev) / `info` (build) | Ambang log di console browser pemain; **satu-satunya** variabel `VITE_` yang dibaca kode |
| `DEV_API_PROXY_TARGET` | `http://127.0.0.1:3001`        | Hanya dibaca `vite.config.ts` (sisi Node), tidak pernah sampai ke browser                |
| `DEV_ALLOWED_HOSTS`    | kosong                         | Nama host tambahan untuk dev server, dipisah koma                                        |

Angka yang harus sama di klien dan server (`protocolVersion`, `simulation.hz`) tidak diatur lewat env: keduanya berasal dari satu `GameConfig` di `packages/shared`. Salah konfigurasi tidak pernah diabaikan diam-diam — server maupun klien berhenti dengan pesan yang menyebut variabel yang keliru.

**Tidak ada rahasia di klien.** Semua yang berawalan `VITE_` dikirim ke setiap browser pemain; satu-satunya yang dipakai proyek ini adalah `VITE_LOG_LEVEL`, yang bukan rahasia.

## Keamanan (ringkas)

Server adalah otoritas: klien hanya mengirim _intent_, dan server memutuskan hasil. Yang sudah berlaku: bind lokal secara bawaan, rate limit global (rute tak dikenal ikut dibatasi), header keamanan, batas body 16 KiB, error 5xx yang tidak membocorkan detail, redaksi header sensitif di log, same-origin tanpa CORS, dan render UI tanpa `innerHTML`. Autentikasi (sisi server) dan keamanan WebSocket dijadwalkan di Fase 10-11. Rincian dan rencana per fase: [ARCHITECTURE.md bagian 9](docs/ARCHITECTURE.md#9-keamanan).

## Dokumentasi

| Dokumen                                   | Isi                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)   | Prinsip, struktur, aturan dependensi, alur boot, kontrak, keamanan, tes |
| [TECH-STACK.md](docs/TECH-STACK.md)       | Dependensi, alasan pemilihan, lisensi, peringatan versi TypeScript      |
| [ROADMAP.md](docs/ROADMAP.md)             | 16 fase, kriteria selesai, bukti verifikasi Fase 1 dan 1.5              |
| [SETUP-WINDOWS.md](docs/SETUP-WINDOWS.md) | Pemasangan, pemecahan masalah, ponsel, WSL                              |
| [ORIGINALITY.md](docs/ORIGINALITY.md)     | Kebijakan orisinalitas dan daftar periksa                               |

## Lisensi

Belum dipilih. `package.json` menandai paket sebagai `UNLICENSED` (semua hak dilindungi) sampai pemilik proyek memutuskan.
