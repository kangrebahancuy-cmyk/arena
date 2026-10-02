# Arsitektur Project Realm

Dokumen ini menjelaskan **bagaimana sistem disusun dan kenapa**. Daftar teknologi ada di [TECH-STACK.md](TECH-STACK.md), urutan pengerjaan di [ROADMAP.md](ROADMAP.md).

> Status: yang dijelaskan sebagai "ada" benar-benar sudah dibangun dan diuji di Fase 1. Yang belum dibangun ditandai **belum ada** atau **TODO**, dan tidak ada kode yang berpura-pura mengisinya.

## 1. Prinsip utama

1. **Server adalah otoritas.** Klien hanya mengirim _intent_ ("bergerak ke kiri", "serang target 42"). Server yang memutuskan posisi sah, damage, loot, EXP, kematian, dan semua state penting lain. Klien tidak pernah menentukan hasil.
2. **Tidak ada data palsu.** Semua yang tampil di layar berasal dari server atau dari proses nyata di browser. Fitur yang belum punya backend berbentuk _interface_ + `TODO`, bukan stub yang "selalu sukses".
3. **Kontrak dulu, validasi di perbatasan.** Bentuk data jaringan didefinisikan satu kali di `packages/shared` (zod). Server memvalidasi semua input dari klien, dan klien memvalidasi semua respons dari server.
4. **Modular dengan arah dependensi satu arah.** Lapisan atas boleh memakai lapisan bawah, tidak sebaliknya. Aturan ini ditegakkan ESLint, bukan sekadar konvensi (bagian 4).
5. **Aman secara default.** Server hanya mendengarkan `127.0.0.1`, ada rate limit global, header keamanan, batas ukuran body, dan tidak ada rahasia di sisi klien.

## 2. Gambaran sistem

```
┌─────────────────────────────┐          ┌─────────────────────────────────────┐
│  Browser  (apps/client)     │   HTTP   │  Game server  (apps/server)         │
│                             │ ───────▶ │  Fastify                            │
│  app ▸ ui ▸ boot ▸ net ▸ core│  /api/* │   ├─ http/    plugin keamanan, rute │
│                             │ ◀─────── │   ├─ config/  env tervalidasi       │
│  Fase 2+: renderer, input,  │   JSON   │   ├─ core/    clock (+ game loop    │
│  game state                 │          │   │           di fase berikutnya)   │
└──────────────┬──────────────┘          │   └─ ports/   interface saja (TODO) │
               │ selalu same-origin      └──────────────────┬──────────────────┘
               ▼                                            │ adapter: Fase 11-12
  dev   : Vite dev server meneruskan /api                   ▼
  prod  : reverse proxy (Fase 15)                  PostgreSQL (belum ada)

            packages/shared  ◀── diimpor KEDUA sisi (hanya kontrak: konstanta + skema zod)
```

Klien **selalu memanggil origin-nya sendiri** (`/api/...`). Di development, Vite meneruskan permintaan itu ke server (`apps/client/vite.config.ts`). Akibatnya:

- kode browser tidak perlu tahu alamat server (tidak ada yang bocor atau salah konfigurasi),
- tidak butuh CORS, dan cookie sesi (Fase 11) tetap _first-party_,
- tetap bekerja tanpa perubahan dari ponsel di Wi-Fi yang sama.

Soket realtime (Fase 10) akan memakai pola yang sama lewat `/ws`.

## 3. Prioritas arsitektur dan lokasinya

Urutan prioritas yang ditetapkan untuk proyek ini, dan di mana tiap komponen berada:

| #   | Komponen               | Lokasi                                                        | Fase | Kondisi sekarang                                                             |
| --- | ---------------------- | ------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------- |
| 1   | Client                 | `apps/client`                                                 | 1, 2 | **Ada:** kerangka, konfigurasi, layar boot yang memakai respons server asli  |
| 2   | Game renderer          | `apps/client/src/render/` (belum dibuat)                      | 2    | **Belum ada.** Folder sengaja belum dibuat agar tidak ada kode kosong        |
| 3   | Input system           | `apps/client/src/input/` (belum dibuat)                       | 3    | **Belum ada**                                                                |
| 4   | Game state             | klien: `src/state/`; server: `src/game/` (belum dibuat)       | 3-6  | **Belum ada**                                                                |
| 5   | Multiplayer networking | klien: `src/net/GameConnection.ts`; server: gateway WebSocket | 10   | **Interface** `GameConnection` (TODO), belum ada implementasi                |
| 6   | Backend server         | `apps/server`                                                 | 1    | **Ada:** HTTP, keamanan dasar, konfigurasi, graceful shutdown                |
| 7   | Database               | `apps/server/src/ports/` + adapter                            | 11   | **Interface** (TODO)                                                         |
| 8   | Authentication         | `apps/server/src/ports/auth.ts`                               | 11   | **Interface** `AuthService` (TODO). Tidak ada rute `/api/auth/*` sama sekali |
| 9   | Persistence            | `apps/server/src/ports/characters.ts`, `ports/world.ts`       | 12   | **Interface** `CharacterRepository`, `WorldRepository` (TODO)                |

## 4. Struktur monorepo dan aturan dependensi

```
arena/
├─ apps/
│  ├─ client/                     Browser client (Vite + TypeScript)
│  │  ├─ index.html, public/
│  │  ├─ vite.config.ts           proxy /api, define __APP_VERSION__
│  │  └─ src/
│  │     ├─ main.ts               entry point: pasang CSS, panggil startApp
│  │     ├─ globals.d.ts          deklarasi tipe untuk __APP_VERSION__ (disuntik Vite)
│  │     ├─ app/                  composition root (startApp.ts)
│  │     ├─ ui/                   DOM: BootScreen, dom.ts (el), format.ts, styles.css
│  │     ├─ boot/                 BootController: state machine alur boot
│  │     ├─ net/                  ApiClient, health, GameConnection (TODO Fase 10)
│  │     ├─ core/                 utilitas murni tanpa dependensi (backoff)
│  │     └─ config/               konfigurasi publik klien
│  └─ server/                     Game server (Fastify + TypeScript)
│     ├─ scripts/build.mjs        bundel produksi (esbuild) -> dist/main.js
│     └─ src/
│        ├─ main.ts               entry point: env, listen, graceful shutdown
│        ├─ app.ts                buildApp(): rakit Fastify (tanpa listen, mudah dites)
│        ├─ http/                 plugins/security.ts, routes/health.ts, errors.ts
│        ├─ config/               env.ts: skema zod + nilai default aman
│        ├─ core/                 clock.ts (Clock bisa disuntik untuk tes)
│        └─ ports/                interface auth/characters/world (TODO)
├─ packages/
│  └─ shared/                     @project-realm/shared: kontrak klien-server
│     └─ src/                     constants.ts, api/health.ts, api/error.ts
├─ docs/                          dokumen ini dan kawan-kawannya
├─ scripts/clean.mjs              pembersih lintas-platform (tanpa rm -rf)
└─ .github/workflows/ci.yml       CI: Ubuntu + Windows x Node 22 + 24
```

### 4.1 Batas antar paket

| Paket             | Boleh mengimpor                 | Tidak boleh mengimpor                                |
| ----------------- | ------------------------------- | ---------------------------------------------------- |
| `packages/shared` | `zod`                           | `node:*`, kode server, kode klien, `fastify`, `vite` |
| `apps/client`     | `shared`, `zod`                 | `node:*`, kode server, `fastify`                     |
| `apps/server`     | `shared`, `fastify`, plugin-nya | kode klien, `vite`                                   |

`packages/shared` berjalan di browser **dan** Node, sehingga tidak boleh memakai API khusus salah satunya. Paket ini mengekspor TypeScript mentah (`src/index.ts`); Vite, `tsx`, dan esbuild yang mengkompilasinya. Tidak ada langkah build terpisah dan tidak ada `dist` yang bisa basi.

npm workspaces menaikkan semua paket ke `node_modules` root, sehingga impor terlarang tetap akan _berhasil di-resolve_ saat runtime (_phantom dependency_). Karena itu batas ini ditegakkan oleh `no-restricted-imports` di `eslint.config.js`, dan `npm run check` gagal bila dilanggar.

### 4.2 Lapisan di dalam tiap aplikasi

Sebuah lapisan hanya boleh mengimpor dari lapisan **di sebelah kanannya**. `config` dan `shared` boleh dipakai dari mana saja.

```
klien :  app ──▶ ui ──▶ boot ──▶ net ──▶ core
server:  main ──▶ app ──▶ http ──▶ config | core | ports
```

Alasannya praktis: lapisan bawah bisa diganti atau dites tanpa lapisan di atasnya. Misalnya `BootController` (lapisan `boot`) dites penuh tanpa DOM, dan `ApiClient` (lapisan `net`) dites dengan `fetch` palsu yang disuntikkan.

> **Catatan perubahan dari rencana awal:** `BootController` ada di `src/boot/`, bukan `src/app/`. `ui/BootScreen` mengimpor tipe `BootState`; jika controller ada di `app/`, `ui` harus mengimpor _ke atas_ ke `app` dan melanggar arah dependensi di atas.

Hasil pengujian aturan: 10 impor terlarang (termasuk impor relatif bertingkat `../../ui/dom`) ditolak ESLint, dan 3 impor yang sah tidak ditolak.

## 5. Alur boot klien

`BootController` adalah _state machine_ murni (tanpa DOM, tanpa global). `BootScreen` hanya menampilkan state-nya, dan `app/startApp.ts` merakit keduanya.

```
            start()
               │
               ▼
        ┌─────────────┐   protocolVersion berbeda   ┌──────────────┐
        │  checking   │ ──────────────────────────▶ │ incompatible │   terminal:
        └──────┬──────┘                             └──────────────┘   tombol "Reload page"
     sukses    │    │ gagal
   ┌───────────┘    └─────────────┐
   ▼                              ▼
┌────────┐              ┌──────────────────────────┐
│ online │              │ offline {reason, attempt,│ ── tunggu 1s, 2s, 4s, 8s, 15s, 15s … ──▶ checking
└────────┘              │          retryInMs}      │
                        └──────────────────────────┘
                               ▲
                  retryNow() ("Retry now") melewati penantian
```

- Penantian memakai `nextBackoffDelay` (`core/backoff.ts`): dasar 1 s, faktor 2, batas atas 15 s. **Belum ada jitter**; tambahkan sebelum dipakai untuk reconnect WebSocket skala besar (Fase 10) agar ribuan klien tidak mencoba bersamaan.
- Hasil permintaan lama diabaikan lewat `AbortController` (`retryNow()` dan `stop()` membatalkan permintaan yang sedang berjalan).
- `reason.kind`: `network`, `timeout` (5 s), `aborted`, `http`, `invalid-response`, atau `unexpected` (bukan `ApiError`: dicatat lewat `console.error` karena itu bug).
- Respons yang lolos validasi tetapi dari server yang salah ditolak: `HealthResponseSchema` mewajibkan `service` bernilai `project-realm-server`, jadi program lain yang kebetulan menempati port itu muncul sebagai `invalid-response`.

## 6. Kontrak HTTP

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "project-realm-server",
  "version": "0.1.0",
  "protocolVersion": 1,
  "uptimeSeconds": 134.25,
  "serverTime": "2026-10-02T12:00:00.000Z"
}
```

Semua nilai dihitung server saat permintaan diterima (tidak ada yang ditulis tetap di klien), dan responsnya `cache-control: no-store`. `protocolVersion` adalah _handshake_ kompatibilitas: klien menolak lanjut jika berbeda dengan `PROTOCOL_VERSION` miliknya. Naikkan konstanta itu (di `packages/shared/src/constants.ts`) pada **setiap** perubahan kontrak yang tidak kompatibel.

### Bentuk error

Semua respons non-2xx berbentuk `{ "error": "<kode>", "message": "<teks>" }`.

| Status | `error`             | Catatan                                                  |
| ------ | ------------------- | -------------------------------------------------------- |
| 4xx    | `bad_request`       | Pesan dari Fastify/validasi                              |
| 404    | `not_found`         | Rute tak dikenal juga kena rate limit                    |
| 413    | `payload_too_large` | Batas body 16 KiB                                        |
| 429    | `too_many_requests` | Disertai header `retry-after` dan `x-ratelimit-*`        |
| 5xx    | `internal_error`    | Pesan **selalu generik**; detail hanya ada di log server |

`error` sengaja bertipe `string` (bukan enum) di sisi klien: server yang lebih baru boleh menambah kode baru tanpa membuat klien lama gagal mem-parse responsnya.

## 7. Model server-otoritatif (aturan untuk fase berikutnya)

| Hal                     | Klien mengirim                   | Server memutuskan                                          |
| ----------------------- | -------------------------------- | ---------------------------------------------------------- |
| Posisi                  | input / arah gerak               | posisi sah (kecepatan, tabrakan, batas peta)               |
| Serangan                | "serang target X"                | jarak, cooldown, target hidup/mati, damage (RNG di server) |
| Loot, EXP, level, quest | aksi (mis. "ambil item Y")       | semuanya; klien hanya menampilkan                          |
| Inventori dan equipment | "pakai/pindahkan item di slot N" | kepemilikan, validitas slot, hasil akhir                   |
| Chat                    | teks pesan                       | panjang, laju, filter, siapa yang boleh menerima           |

Klien boleh **memprediksi** (mis. menggeser avatar segera agar terasa responsif), tetapi prediksi itu selalu direkonsiliasi dengan jawaban server dan tidak pernah dianggap benar sendiri.

Setiap data dari klien melewati tiga pintu: **bentuk** divalidasi (zod), **aturan** divalidasi (aturan game), dan **laju** dibatasi (rate limit per koneksi). Rincian netcode (frekuensi tick, snapshot atau delta, _interest management_) diputuskan di Fase 10.

## 8. Fitur yang belum dibangun: port dan interface (TODO)

Port adalah _interface_ yang dipakai kode game dan HTTP untuk apa pun yang berada di luar proses. Kode game tidak pernah mengimpor driver database secara langsung. Adapter (PostgreSQL, dll.) mengimplementasikannya di fase berikutnya.

| Port                               | File                                    | Fase  | Entitas basis data terkait             |
| ---------------------------------- | --------------------------------------- | ----- | -------------------------------------- |
| `AuthService`                      | `apps/server/src/ports/auth.ts`         | 11    | User                                   |
| `CharacterRepository<TPersisted>`  | `apps/server/src/ports/characters.ts`   | 11-12 | Character, Inventory, Equipment, Quest |
| `WorldRepository<TZoneState>`      | `apps/server/src/ports/world.ts`        | 12    | data dunia yang persisten              |
| `GameConnection<TClient, TServer>` | `apps/client/src/net/GameConnection.ts` | 10    | (jaringan, bukan basis data)           |

Aturan keras: **port tanpa adapter berarti fitur belum ada.** Pemanggil harus memperlakukannya begitu. Jangan menambah implementasi "selalu sukses" untuk melancarkan pekerjaan UI. Port bersifat _generik_ (`TPersisted`, `TZoneState`) karena bentuk data karakter dan dunia baru dirancang di Fase 7-9; menebak field sekarang hanya akan membuat kita merobohkannya nanti. Entitas `Item` (definisi item) adalah keputusan terbuka: data statis di repo atau tabel basis data (lihat bagian 14).

## 9. Keamanan

### Sudah ada di Fase 1

| Kontrol                     | Detail                                                                                                                                       | Lokasi                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Bind lokal secara default   | `HOST=127.0.0.1`. Container atau server harus menyetel `0.0.0.0` secara eksplisit                                                            | `config/env.ts`                      |
| Header keamanan             | `@fastify/helmet` (CSP, `nosniff`, HSTS, COOP/CORP, dll.). Berlaku untuk respons **API**; halaman klien statis butuh CSP sendiri di produksi | `http/plugins/security.ts`           |
| Rate limit global per IP    | 120 permintaan per 60 s (bisa diatur). Rute tak dikenal ikut dibatasi. IPv6 dikelompokkan per /64                                            | `http/plugins/security.ts`, `app.ts` |
| Batas ukuran body           | 16 KiB                                                                                                                                       | `app.ts`                             |
| Error handler terpusat      | 5xx selalu generik; detail hanya di log                                                                                                      | `app.ts`                             |
| Redaksi log                 | `authorization`, `cookie`, `set-cookie` disensor                                                                                             | `app.ts`                             |
| Env divalidasi, gagal cepat | Nilai salah menghentikan server dengan pesan yang menyebut variabel mana yang keliru                                                         | `config/env.ts`                      |
| `TRUST_PROXY=false`         | Header `X-Forwarded-*` tidak dipercaya kecuali server berada di belakang proxy milik sendiri (kalau tidak, IP bisa dipalsukan)               | `config/env.ts`                      |
| Same-origin, tanpa CORS     | Tidak ada `@fastify/cors`. Vite dev server menolak header `Host` asing (403) sebagai perlindungan DNS-rebinding                              | `vite.config.ts`                     |
| Tidak ada rahasia di klien  | Hanya variabel berawalan `VITE_` yang masuk ke bundel browser, dan proyek ini tidak memakai satu pun                                         | `apps/client/.env.example`           |
| Render UI aman dari injeksi | Tidak ada `innerHTML`. Teks dari server selalu menjadi _text node_. Ada tes yang gagal bila aturan ini dilanggar                             | `ui/dom.ts`, `ui/BootScreen.ts`      |

### Direncanakan (per fase)

- **Fase 10:** validasi zod untuk **setiap** pesan WebSocket, batas ukuran pesan, rate limit per koneksi, pemeriksaan header `Origin` pada _upgrade_, batas koneksi per IP.
- **Fase 11:** Argon2id untuk password, sesi di sisi server (token acak, disimpan ter-_hash_, dikirim hanya lewat cookie `HttpOnly` + `SameSite`), pemeriksaan `Origin` untuk perlindungan CSRF, rate limit login per IP **dan** per username.
- **Fase 13:** rate limit dan sanitasi chat.
- **Fase 14:** CSP untuk klien, tinjauan keamanan, uji beban, `npm audit` rutin di CI.
- **Fase 15:** TLS di reverse proxy, manajemen secret, pencadangan basis data.

## 10. Konfigurasi

Server membaca variabel berikut. Semuanya opsional; nilai default aman dipakai bila tidak diisi. Template ada di `apps/server/.env.example`. Salin menjadi `apps/server/.env` (git mengabaikannya). Variabel yang sudah ada di environment sistem **selalu menang** atas isi file.

| Variabel                    | Default       | Validasi                                                     |
| --------------------------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`                  | `development` | `development`, `test`, atau `production`                     |
| `HOST`                      | `127.0.0.1`   | tidak boleh kosong                                           |
| `PORT`                      | `3001`        | bilangan bulat 1-65535                                       |
| `LOG_LEVEL`                 | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `TRUST_PROXY`               | `false`       | boolean (`true`/`false` dan padanannya)                      |
| `HTTP_RATE_LIMIT_MAX`       | `120`         | bilangan bulat positif                                       |
| `HTTP_RATE_LIMIT_WINDOW_MS` | `60000`       | bilangan bulat, minimal 1000                                 |

Variabel di luar daftar ini **diabaikan**, sehingga salah ketik tidak mengubah pengaturan lain secara diam-diam. Log berbentuk teks rapi hanya saat `NODE_ENV=development`; selain itu berupa JSON per baris.

Klien hanya punya satu pengaturan, `DEV_API_PROXY_TARGET` (default `http://127.0.0.1:3001`), dan nilainya hanya dibaca `vite.config.ts` (sisi Node), tidak pernah sampai ke kode browser. Alamat memakai `127.0.0.1`, bukan `localhost`, karena di Windows `localhost` bisa di-resolve ke IPv6 `::1` sementara server mendengarkan IPv4.

## 11. Siklus hidup dan observabilitas server

- **Logging:** pino lewat Fastify. Setiap permintaan tercatat; level diatur `LOG_LEVEL`.
- **Graceful shutdown:** `SIGINT` (Ctrl+C), `SIGTERM`, dan `SIGBREAK` (Windows) memicu `app.close()` lalu keluar dengan kode 0. Jika shutdown macet, proses dipaksa keluar setelah 10 detik. Fase berikutnya mengaitkan penutupan game loop dan penyimpanan data lewat hook `onClose` Fastify.
- **Kegagalan tak terduga:** `uncaughtException` dan `unhandledRejection` dicatat sebagai `fatal`, server ditutup dengan rapi, lalu keluar dengan kode 1 agar _supervisor_ dapat me-restart.
- **Gagal start:** port dipakai (`EADDRINUSE`) atau ditolak (`EACCES`, umum di Windows) menghasilkan pesan yang menyebut solusinya dan keluar dengan kode 1.

## 12. Strategi pengujian

- Tes berada di samping kodenya (`*.test.ts`), dijalankan Vitest per workspace. `npm test` menjalankan semuanya, dan `npm run check` menambah typecheck, lint, dan cek format.
- Dependensi **disuntikkan**, bukan di-_mock_ secara global: `fetch` ke `ApiClient`, `Clock` ke server, objek env ke `loadConfig`. Waktu dikendalikan dengan _fake timers_.
- DOM dites dengan `happy-dom` (dipilih ketimbang `jsdom` karena `jsdom` 30 mensyaratkan Node >= 22.22.2, lebih tinggi dari `engines` proyek).
- Tes keamanan dibuktikan bisa gagal: kode diubah sementara agar memakai `innerHTML`, dan tes yang relevan harus merah sebelum kode dikembalikan.
- **Belum otomatis di repo:** tes browser end-to-end. Pada verifikasi Fase 1, skenario browser (Online, Offline lalu Retry, pemulihan otomatis, protokol tidak cocok, teks server berbahaya, keyboard, tampilan mobile) dijalankan manual di Chromium sungguhan, dan semuanya lulus. Menjadikannya tes otomatis (mis. Playwright) dianjurkan mulai Fase 2 ketika ada tampilan yang perlu dijaga.
- CI (`.github/workflows/ci.yml`): `npm ci`, `npm run check`, `npm run build` pada Ubuntu dan Windows, Node 22 dan 24. Berkas workflow sudah divalidasi dengan parser workflow resmi GitHub, tetapi **belum pernah dijalankan di GitHub**; jalankan pertama kalinya saat di-push.

## 13. Cara menambah fitur (resep)

**Endpoint HTTP baru**

1. Tambahkan path dan skema respons/permintaan di `packages/shared/src/api/` lalu ekspor dari `index.ts`.
2. Buat modul rute di `apps/server/src/http/routes/` (fungsi `registerXxxRoute(app, deps)`) dan daftarkan di `buildApp` (`app.ts`).
3. Panggil dari klien lewat `ApiClient.get(path, skema)` di lapisan `net/`, sehingga respons divalidasi.
4. Tulis tes di kedua sisi. Jika kontrak lama rusak, naikkan `PROTOCOL_VERSION`.

**Adapter untuk sebuah port**

Implementasikan interface di `ports/` pada folder baru (mis. `adapters/postgres/`), lalu suntikkan lewat `buildApp`. Kode game tetap hanya mengenal interface-nya.

**Modul klien baru**

Letakkan di lapisan yang tepat (bagian 4.2), rakit di `app/startApp.ts`, dan jangan impor "ke atas". Bila sebuah modul butuh impor ke atas, itu tanda desainnya perlu diubah (biasanya tipe atau interface pindah ke lapisan bawah).

## 14. Keputusan yang sengaja ditunda

| Keputusan                                   | Diputuskan di | Opsi yang dipertimbangkan                                                         |
| ------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| Renderer 2D                                 | Fase 2        | PixiJS (renderer saja, cocok dengan pemisahan modul) vs framework game penuh      |
| Model gerak dan prediksi                    | Fase 3        | fungsi gerak deterministik di `shared`, dipakai klien dan server                  |
| Format peta                                 | Fase 4        | JSON gaya Tiled yang divalidasi zod, vs format sendiri                            |
| Framework UI untuk overlay (HUD, inventori) | Fase 7        | DOM helper `el()` yang ada, vs Preact + signals                                   |
| Transport dan protokol realtime             | Fase 10       | WebSocket mentah + protokol sendiri di `shared` (bawaan), vs framework room       |
| Basis data dan lapisan akses                | Fase 11       | PostgreSQL dengan Drizzle, Kysely, atau Prisma; opsi lebih ringan untuk dev lokal |
| Definisi `Item`: data statis atau tabel     | Fase 7/11     | berkas data tervalidasi di repo vs tabel basis data                               |

## 15. Perubahan terhadap rencana yang diposting sebelum coding

| Rencana awal                   | Yang dibangun                                                 | Alasan                                                                                                       |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BootController` di `src/app/` | `src/boot/`                                                   | Menjaga arah dependensi `app → ui → boot → net → core` (bagian 4.2)                                          |
| Bundel server dengan `tsup`    | Skrip esbuild: `apps/server/scripts/build.mjs`                | README `tsup` menyatakan proyeknya tidak lagi dirawat; esbuild adalah dasar yang sama tanpa lapisan tambahan |
| Scope paket `@realm/*`         | `@project-realm/*`                                            | `@realm` dipakai MongoDB Realm; `@project-realm` terbukti bebas di npm (E404)                                |
| (belum direncanakan)           | `happy-dom` (devDependency klien) dan aturan ESLint pelapisan | Agar lapisan UI punya tes permanen dan klaim "arah dependensi satu arah" benar-benar ditegakkan              |
