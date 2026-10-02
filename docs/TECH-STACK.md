# Teknologi dan Dependensi

Dokumen ini menjawab dua pertanyaan: **apa yang dipasang** dan **kenapa itu yang dipilih**. Untuk cara bagian-bagiannya disusun, lihat [ARCHITECTURE.md](ARCHITECTURE.md).

Versi pasti selalu ada di `package-lock.json`. Rentang di bawah diambil dari `package.json`. Data registri npm diverifikasi pada **2026-10-02**. Pada tanggal itu `npm audit` melaporkan **0 kerentanan** (semua dependensi maupun hanya produksi), dan tidak ada paket yang ditandai _deprecated_.

## 1. Kriteria pemilihan

Setiap teknologi harus memenuhi semuanya:

1. **Nyata dan dirawat.** Versinya diperiksa langsung ke registri npm (bukan diingat), dan tidak ada paket yang kami karang.
2. **Jalan di Windows tanpa kompilasi.** Tidak perlu Visual Studio Build Tools atau `node-gyp`. Pada Fase 1 semua binary native (esbuild, Rolldown, Lightning CSS) tersedia sebagai paket _prebuilt_ untuk win32, dan tercatat di `package-lock.json`.
3. **TypeScript-first.** Tipe yang sama dipakai klien dan server lewat `packages/shared`.
4. **Mudah diganti.** Pilihan yang belum perlu dibuat ditunda ke fasenya (lihat [ARCHITECTURE.md bagian 14](ARCHITECTURE.md#14-keputusan-yang-sengaja-ditunda)).

## 2. Platform

| Hal             | Pilihan                                                 | Catatan                                                                                                                                  |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | **Node.js `^22.13.0 \|\| ^24.0.0 \|\| >=26.0.0`**       | Batas bawah 22.13 datang dari ESLint 10. `.npmrc` memakai `engine-strict=true`, sehingga Node yang terlalu lama gagal dengan pesan jelas |
| Package manager | **npm workspaces**                                      | Ikut terpasang bersama Node; tidak ada alat tambahan yang bisa gagal di Windows                                                          |
| Bahasa          | **TypeScript `~6.0.3`**, ESM penuh (`"type": "module"`) | Lihat bagian 5 tentang kenapa versinya dipatok                                                                                           |
| Browser (klien) | Target build Vite 8 `baseline-widely-available`         | Antara lain Chrome 111 dan Safari 16.4 ke atas, jadi iOS 16.4+ dan Android modern didukung. `AbortSignal.any` sengaja **tidak** dipakai  |

## 3. Dependensi yang terpasang

### Runtime server (`apps/server`)

| Paket                 | Rentang   | Fungsi                                                                                                                                |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `fastify`             | `^5.12.5` | Kerangka HTTP. Arsitektur plugin, logger pino bawaan, dan plugin resmi untuk keamanan serta WebSocket yang dipakai di fase berikutnya |
| `@fastify/helmet`     | `^13.1.1` | Header keamanan HTTP                                                                                                                  |
| `@fastify/rate-limit` | `^11.2.0` | Rate limit global per IP (juga untuk rute 404)                                                                                        |
| `zod`                 | `^4.6.5`  | Validasi dan parsing environment dan (nanti) semua input klien                                                                        |

### Runtime klien (`apps/client`, ikut ke bundel browser)

| Paket | Rentang  | Fungsi                                                                                                                                                                  |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zod` | `^4.6.5` | Memvalidasi respons server. **Ini hampir seluruh ukuran bundel (JS 92 kB, 27 kB gzip)**. Jika ukuran menjadi masalah di Fase 14, pertimbangkan pustaka yang lebih kecil |

Kode `@project-realm/shared` (konstanta dan skema) ikut dibundel di kedua sisi. Satu-satunya dependensi pihak ketiga yang sampai ke pemain adalah `zod`.

### Alat pengembangan

| Paket                    | Rentang               | Dipakai untuk                                                                                                 |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `typescript`             | `~6.0.3`              | Pemeriksaan tipe (`tsc --noEmit`); bukan untuk menghasilkan JS                                                |
| `vite`                   | `^8.3.2`              | Dev server klien (HMR, proxy `/api`), bundel produksi, `vite preview`                                         |
| `vitest`                 | `^5.0.3`              | Pengujian di semua workspace                                                                                  |
| `happy-dom`              | `^20.14.5`            | Lingkungan DOM untuk tes UI klien                                                                             |
| `tsx`                    | `^4.23.15`            | Menjalankan server TypeScript langsung dan memulai ulang otomatis (`tsx watch`)                               |
| `esbuild`                | `^0.28.2`             | Bundel produksi server (`apps/server/scripts/build.mjs`)                                                      |
| `eslint`, `@eslint/js`   | `^10.11.0`, `^10.0.1` | Linter (flat config `eslint.config.js`)                                                                       |
| `typescript-eslint`      | `^8.71.0`             | Aturan lint yang memahami tipe (mis. `no-floating-promises`), dan aturan batas modul                          |
| `eslint-config-prettier` | `^10.1.8`             | Mematikan aturan gaya ESLint yang bentrok dengan Prettier                                                     |
| `prettier`               | `^3.9.9`              | Format kode, JSON, CSS, YAML, dan Markdown                                                                    |
| `globals`                | `^17.13.0`            | Daftar variabel global Node untuk berkas `.js`/`.mjs`                                                         |
| `concurrently`           | `^10.0.5`             | `npm run dev`: server dan klien dalam satu terminal                                                           |
| `cross-env`              | `^10.1.0`             | Mengatur `NODE_ENV` dengan cara yang sama di cmd, PowerShell, dan bash                                        |
| `pino-pretty`            | `^13.1.3`             | Log berwarna dan mudah dibaca, hanya saat development                                                         |
| `@types/node`            | `^22.20.5`            | Tipe Node. Sengaja dipatok ke 22 (batas bawah yang didukung) agar tidak memakai API yang belum ada di Node 22 |

### Lisensi

Dari 290 entri di `package-lock.json` (termasuk binary platform lain yang opsional): MIT 228, Apache-2.0 16, ISC 14, MPL-2.0 12, BSD-3-Clause 8, BSD-2-Clause 7, BlueOak-1.0.0 1, 0BSD 1 (3 sisanya adalah workspace proyek ini sendiri).

Ke-12 paket **MPL-2.0** semuanya `lightningcss` dan varian platformnya: alat build milik Vite untuk minifikasi CSS, hanya dependensi _development_, dan **tidak ikut terkirim ke pemain**. Bundel klien hanya berisi kode proyek ini dan `zod` (MIT). Ini catatan teknis, bukan nasihat hukum; tinjau ulang sebelum rilis publik ([ORIGINALITY.md](ORIGINALITY.md)).

## 4. Kenapa ini dan bukan yang lain

| Kebutuhan           | Dipilih                    | Alasan                                                                                                                                                            | Alternatif yang dipertimbangkan                                                                                  |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Server              | Fastify                    | Arsitektur plugin yang cocok untuk modul fitur, pino bawaan, plugin resmi untuk helmet, rate limit, cookie, dan WebSocket, dan skema/validasi sebagai konsep inti | Express (berfungsi, tetapi lebih sedikit struktur bawaan); NestJS (jauh lebih berat daripada kebutuhan saat ini) |
| Bundler klien       | Vite                       | Dev server cepat, TypeScript langsung, proxy bawaan, dan konfigurasi kecil                                                                                        | webpack (konfigurasi lebih besar), Parcel                                                                        |
| Validasi            | zod                        | Satu skema menghasilkan validasi runtime **dan** tipe TypeScript; dipakai di kedua sisi                                                                           | valibot atau TypeBox (bundel lebih kecil; layak dinilai ulang di Fase 14), ajv                                   |
| Pengujian           | Vitest                     | Memakai transformasi yang sama dengan Vite; ESM dan TypeScript langsung; cepat                                                                                    | Jest (butuh konfigurasi tambahan untuk ESM/TS)                                                                   |
| Monorepo            | npm workspaces             | Tanpa instalasi tambahan, jalan di Windows                                                                                                                        | pnpm, Turborepo, Nx: layak jika waktu build sudah menjadi masalah; tidak sekarang                                |
| Lint                | ESLint + typescript-eslint | Aturan yang memahami tipe (mis. `no-floating-promises`) matang di sini, dan `no-restricted-imports` menegakkan batas modul                                        | Biome (lebih cepat, tetapi aturan berbasis tipe lebih terbatas)                                                  |
| Jalankan server dev | tsx                        | Menjalankan TypeScript ESM langsung dengan mode watch, dan ikut memulai ulang saat berkas di `packages/shared` berubah (terbukti pada verifikasi)                 | ts-node, nodemon                                                                                                 |
| Bundel server       | esbuild (skrip kecil)      | Cepat dan tanpa lapisan tambahan. Dependensi pihak ketiga tetap eksternal supaya addon native (hash password, driver DB) tetap berfungsi di fase berikutnya       | `tsup` (README-nya menyatakan tidak lagi dirawat), `tsdown` (masih 0.x)                                          |

## 5. Peringatan versi: TypeScript sengaja dipatok ke 6.0

Tag `latest` TypeScript di npm saat ini adalah **7.x** (kompiler baru berbasis Go). Namun `typescript-eslint` 8.71 mendeklarasikan peer dependency `typescript >=4.8.4 <6.1.0`. Memasang TypeScript 7 membuat `npm install` gagal dengan `ERESOLVE`, dan memaksanya (`--force`) berarti lint berbasis tipe berjalan di atas versi yang tidak didukung.

Karena itu `typescript` dipatok `~6.0.3`. **Cara menaikkan nanti:** periksa `npm view typescript-eslint peerDependencies`; begitu mendukung TypeScript 7, naikkan keduanya sekaligus, jalankan `npm run check`, lalu perbaiki opsi `tsconfig` yang dihapus di 7.0.

Versi major Vite (8) dan Vitest (5) saling cocok: Vitest 5 mensyaratkan Vite >= 6.4 dan Node >= 22.12.

## 6. Yang sengaja BELUM dipasang

Berikut kandidat untuk fase berikutnya. **Belum ada satu pun yang terpasang**, dan nomor versi hanyalah hasil pemeriksaan registri pada 2026-10-02 sebagai acuan. Verifikasi ulang (versi, peer dependency, dukungan Windows) saat fasenya dimulai.

| Fase | Kebutuhan                   | Kandidat                                                                                 | Catatan                                                                             |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2    | Renderer 2D                 | `pixi.js` 8.22.0                                                                         | Renderer saja (bukan framework game), sehingga game loop dan state tetap milik kita |
| 4    | Peta tile                   | `@pixi/tilemap` 5.0.2                                                                    | Atau penggambar tile sendiri; putuskan bersama format peta                          |
| 7    | UI overlay (HUD, inventori) | `preact` 11.0.0, `@preact/signals` 2.11.3                                                | Atau lanjut dengan helper DOM `el()`; putuskan setelah melihat kompleksitas nyata   |
| 10   | WebSocket                   | `@fastify/websocket` 11.3.1 (berbasis `ws` 8.22.0)                                       | Protokol sendiri di `shared`, divalidasi zod                                        |
| 11   | Sesi dan cookie             | `@fastify/cookie` 11.1.2                                                                 | Cookie `HttpOnly` + `SameSite`                                                      |
| 11   | Hash password               | `@node-rs/argon2` 2.2.1                                                                  | Argon2id. Pastikan tersedia binary _prebuilt_ untuk Windows saat itu                |
| 11   | Basis data                  | PostgreSQL + `pg` 8.23.1, lapisan akses: `drizzle-orm` 0.45.3 / `kysely` 0.29.6 / Prisma | Keputusan tersendiri; syarat penting: mudah dijalankan secara lokal di Windows      |
