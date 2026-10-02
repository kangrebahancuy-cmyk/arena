# Roadmap

Proyek ini dibangun **satu fase pada satu waktu**. Fase berikutnya dimulai hanya setelah pemilik proyek memberi persetujuan eksplisit.

## Aturan kerja

1. Satu fase aktif. Tidak ada pekerjaan fase berikutnya "sambil jalan".
2. Sebuah fase dianggap **selesai** bila: `npm run check` hijau, `npm run build` berhasil, aplikasi berjalan lokal di Windows, dokumen diperbarui, dan tidak ada data atau API palsu.
3. Fitur yang butuh backend yang belum dibangun berbentuk **interface + `TODO(phase-N)`**, bukan stub yang berpura-pura bekerja.
4. Server adalah otoritas. Klien hanya mengirim intent ([ARCHITECTURE.md](ARCHITECTURE.md), bagian 7).
5. Semua aset, nama, peta, dan kode orisinal ([ORIGINALITY.md](ORIGINALITY.md)).

## Ringkasan

| Fase | Judul                          | Status        |
| ---- | ------------------------------ | ------------- |
| 1    | Fondasi proyek                 | **Selesai**   |
| 2    | Rendering 2D                   | Belum dimulai |
| 3    | Pergerakan pemain              | Belum dimulai |
| 4    | Dunia, peta, dan tabrakan      | Belum dimulai |
| 5    | NPC dan monster                | Belum dimulai |
| 6    | Pertarungan                    | Belum dimulai |
| 7    | Inventori, item, dan equipment | Belum dimulai |
| 8    | Progresi karakter              | Belum dimulai |
| 9    | Sistem quest                   | Belum dimulai |
| 10   | Multiplayer WebSocket          | Belum dimulai |
| 11   | Autentikasi dan basis data     | Belum dimulai |
| 12   | Dunia persisten                | Belum dimulai |
| 13   | Chat dan fitur sosial          | Belum dimulai |
| 14   | Optimasi dan keamanan          | Belum dimulai |
| 15   | Deployment                     | Belum dimulai |

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

**Belum diverifikasi:** eksekusi di mesin **Windows** sungguhan (sandbox ini Linux) dan eksekusi CI di GitHub. Yang tersedia sebagai dasar: `package-lock.json` memuat binary win32, skrip tidak memakai sintaks khusus POSIX, dan matriks CI menyertakan `windows-latest`. Eksekusi nyata pertama di Windows ada pada Anda; jika ada masalah, lihat [SETUP-WINDOWS.md](SETUP-WINDOWS.md).

## Fase 2: Rendering 2D

- **Tujuan:** menggambar dunia 2D di browser.
- **Isi:** modul `render/` di klien; game loop (langkah tetap untuk logika, interpolasi untuk gambar); kamera; pemuatan aset; canvas yang responsif di desktop dan ponsel (termasuk _device pixel ratio_ dan orientasi).
- **Selesai bila:** sebuah area tile dengan sprite orisinal tampil lancar di desktop dan ponsel, dan loop render bisa dites tanpa browser.
- **Perlu diputuskan:** renderer (kandidat PixiJS); **siapa yang membuat aset visual** dan dari mana asal tile/sprite pertama (lihat [ORIGINALITY.md](ORIGINALITY.md): aset buatan sendiri, atau yang berlisensi jelas dan tercatat); tes otomatis berbasis browser (Playwright).

## Fase 3: Pergerakan pemain

- **Isi:** sistem input (keyboard, sentuhan: joystick virtual atau ketuk-untuk-bergerak); intent gerak; fungsi langkah gerak yang deterministik di `packages/shared`.
- **Ketegangan desain yang harus dijawab saat fase ini dimulai:** gerak dibangun **sebelum** jaringan (Fase 10), padahal server harus menjadi otoritas. Dua jalan: (a) gerak lokal yang diberi label jelas sebagai simulasi lokal tanpa server, lalu diganti oleh jawaban server di Fase 10, atau (b) menarik kerangka WebSocket minimal lebih awal. Kedua opsi menjaga aturan "tidak ada data palsu" selama UI menyatakan dengan jujur bahwa tidak ada koneksi.
- **Selesai bila:** avatar bergerak di desktop dan ponsel lewat intent, dan logika gerak dites.

## Fase 4: Dunia, peta, dan tabrakan

- **Isi:** format peta tervalidasi zod; lapisan tile; lapisan tabrakan; batas peta; titik spawn; beberapa area dan perpindahan antar area.
- **Server:** memuat peta yang sama dan memvalidasi gerak terhadap tabrakan.
- **Perlu diputuskan:** format peta (JSON gaya Tiled atau format sendiri).

## Fase 5: NPC dan monster

- **Isi:** model entitas; AI di sisi server; spawner dan waktu respawn; data dialog NPC.
- **Selesai bila:** monster dan NPC tampil dari data server dan bergerak sesuai aturan server.

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
