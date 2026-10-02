# Project Realm

> **Project Realm** adalah nama sementara untuk sebuah MMORPG 2D berbasis browser yang **100% orisinal**: real-time, dunia persisten, server sebagai otoritas. Terinspirasi oleh genre MMORPG klasik, tanpa menyalin aset, nama, peta, kode, atau UI dari game mana pun ([kebijakan orisinalitas](docs/ORIGINALITY.md)).

**Status: Fase 1 selesai (fondasi proyek).** Game-nya sendiri belum ada. Yang ada adalah fondasi yang dapat dijalankan dan diuji, tempat fitur-fitur berikutnya dibangun satu fase pada satu waktu ([roadmap](docs/ROADMAP.md)).

## Apa yang sudah nyata, dan apa yang belum

| Sudah ada dan teruji                                                                                                                                      | Belum ada (sengaja)                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Server Fastify dengan `GET /api/health`, header keamanan, rate limit, graceful shutdown, konfigurasi env tervalidasi                                      | Rendering 2D, input, gerak, peta, NPC, monster, pertarungan, inventori, quest (Fase 2-9) |
| Klien Vite + TypeScript dengan layar boot yang menampilkan hasil pemeriksaan server **sungguhan**: online, offline (retry otomatis), protokol tidak cocok | WebSocket multiplayer (Fase 10)                                                          |
| Kontrak bersama klien-server (zod) di `packages/shared`                                                                                                   | Akun, login, basis data, penyimpanan karakter dan dunia (Fase 11-12)                     |
| Lint, format, 94 tes, CI (Ubuntu dan Windows)                                                                                                             | Chat dan sosial, optimasi, deployment (Fase 13-15)                                       |

Fitur yang belum dibangun berbentuk **interface bertanda `TODO`** di kode (`AuthService`, `CharacterRepository`, `WorldRepository`, `GameConnection`). **Tidak ada data atau API palsu:** layar yang Anda lihat hanya menampilkan apa yang benar-benar dijawab server.

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

**3. Buka http://localhost:5173** di browser. Anda akan melihat kartu "System check" dengan server **Online**. Hentikan dengan **Ctrl+C**.

Butuh Node.js **22.13 atau lebih baru** (`node -v`). Ada masalah? Lihat [panduan Windows](docs/SETUP-WINDOWS.md): kebijakan eksekusi PowerShell, port yang dicadangkan Windows (`EACCES`), firewall, `EBADENGINE`, WSL, dan membuka dari ponsel.

## Perintah

| Perintah                            | Fungsi                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                       | Server (`:3001`) dan klien (`:5173`) sekaligus, muat ulang otomatis             |
| `npm run check`                     | Typecheck, lint, cek format, dan semua tes (jalankan sebelum commit)            |
| `npm test`                          | Semua tes                                                                       |
| `npm run build`                     | Build produksi: `apps/server/dist` dan `apps/client/dist`                       |
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
│  ├─ client/    Klien browser (Vite + TypeScript)
│  └─ server/    Server game otoritatif (Fastify + TypeScript)
├─ packages/
│  └─ shared/    Kontrak klien-server: konstanta dan skema zod
├─ docs/         Arsitektur, teknologi, roadmap, panduan Windows, orisinalitas
├─ scripts/      Alat repo (clean)
└─ .github/      CI
```

Dependensi mengalir satu arah (klien: `app → ui → boot → net → core`; server: `main → app → http → config/core/ports`), dan ESLint menggagalkan `npm run check` bila dilanggar. Penjelasan lengkap: [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Konfigurasi

Semuanya opsional; bawaannya aman. Untuk mengubah, salin template (berkas `.env` diabaikan git):

```
copy apps\server\.env.example apps\server\.env
```

Di PowerShell: `Copy-Item apps\server\.env.example apps\server\.env`.

| Variabel (server)           | Bawaan      | Keterangan                                                     |
| --------------------------- | ----------- | -------------------------------------------------------------- |
| `HOST`                      | `127.0.0.1` | Hanya komputer ini. Pakai `0.0.0.0` hanya di belakang firewall |
| `PORT`                      | `3001`      | Jika diubah, ubah juga `DEV_API_PROXY_TARGET` di `apps/client` |
| `LOG_LEVEL`                 | `info`      | `fatal` sampai `trace`, atau `silent`                          |
| `TRUST_PROXY`               | `false`     | `true` hanya di belakang reverse proxy milik sendiri           |
| `HTTP_RATE_LIMIT_MAX`       | `120`       | Permintaan per IP per jendela waktu                            |
| `HTTP_RATE_LIMIT_WINDOW_MS` | `60000`     | Minimal 1000                                                   |

**Tidak ada rahasia di klien.** Semua yang berawalan `VITE_` dikirim ke setiap browser pemain; proyek ini tidak memakainya.

## Keamanan (ringkas)

Server adalah otoritas: klien hanya mengirim _intent_, dan server memutuskan hasil. Yang sudah berlaku: bind lokal secara bawaan, rate limit global (rute tak dikenal ikut dibatasi), header keamanan, batas body 16 KiB, error 5xx yang tidak membocorkan detail, redaksi header sensitif di log, same-origin tanpa CORS, dan render UI tanpa `innerHTML`. Autentikasi (sisi server) dan keamanan WebSocket dijadwalkan di Fase 10-11. Rincian dan rencana per fase: [ARCHITECTURE.md bagian 9](docs/ARCHITECTURE.md#9-keamanan).

## Dokumentasi

| Dokumen                                   | Isi                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)   | Prinsip, struktur, aturan dependensi, alur boot, kontrak, keamanan, tes |
| [TECH-STACK.md](docs/TECH-STACK.md)       | Dependensi, alasan pemilihan, lisensi, peringatan versi TypeScript      |
| [ROADMAP.md](docs/ROADMAP.md)             | 15 fase, kriteria selesai, bukti verifikasi Fase 1                      |
| [SETUP-WINDOWS.md](docs/SETUP-WINDOWS.md) | Pemasangan, pemecahan masalah, ponsel, WSL                              |
| [ORIGINALITY.md](docs/ORIGINALITY.md)     | Kebijakan orisinalitas dan daftar periksa                               |

## Lisensi

Belum dipilih. `package.json` menandai paket sebagai `UNLICENSED` (semua hak dilindungi) sampai pemilik proyek memutuskan.
