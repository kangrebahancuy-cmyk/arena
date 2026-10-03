# Arsitektur Project Realm

Dokumen ini menjelaskan **bagaimana sistem disusun dan kenapa**. Daftar teknologi ada di [TECH-STACK.md](TECH-STACK.md), urutan pengerjaan di [ROADMAP.md](ROADMAP.md).

> Status: yang dijelaskan sebagai "ada" benar-benar sudah dibangun dan diuji. Yang belum dibangun ditandai **belum ada** atau **TODO**, dan tidak ada kode yang berpura-pura mengisinya. Fase 1, 1.5, 2, 3, dan 4 selesai; slice NPC/dialog dan monster lokal tersedia sebagai prototipe Fase 5. Klien dan GameServer memuat Greenhaven dari data bersama; server menyediakan validator collision/gerak, tetapi belum menerima intent jaringan atau menjalankan simulasi pemain/AI monster (Fase 10 dan 5 penuh). Lihat [ROADMAP.md](ROADMAP.md).

## 1. Prinsip utama

1. **Server adalah otoritas.** Klien hanya mengirim _intent_ ("bergerak ke kiri", "serang target 42"). Server yang memutuskan posisi sah, damage, loot, EXP, kematian, dan semua state penting lain. Klien tidak pernah menentukan hasil.
2. **Tidak ada data palsu.** Semua yang tampil di layar berasal dari server atau dari proses nyata di browser. Fitur yang belum punya backend berbentuk _interface_ + `TODO`, bukan stub yang "selalu sukses".
3. **Kontrak dulu, validasi di perbatasan.** Bentuk data jaringan didefinisikan satu kali di `packages/shared` (zod). Server memvalidasi semua input dari klien, dan klien memvalidasi semua respons dari server.
4. **Modular dengan arah dependensi satu arah.** Lapisan atas boleh memakai lapisan bawah, tidak sebaliknya. Aturan ini ditegakkan ESLint, bukan sekadar konvensi (bagian 4).
5. **Aman secara default.** Server hanya mendengarkan `127.0.0.1`, ada rate limit global, header keamanan, batas ukuran body, dan tidak ada rahasia di sisi klien.

## 2. Gambaran sistem

```
┌──────────────────────────────────┐          ┌────────────────────────────────────────┐
│  Browser  (apps/client)          │   HTTP   │  Game server  (apps/server)            │
│                                  │ ───────▶ │  GameServer (game/)                    │
│  main ▸ game ▸ ui ▸ boot ▸       │  /api/* │   ├─ http/   Fastify, rute, keamanan   │
│         render ▸ net ▸ core      │ ◀─────── │   ├─ config/ env tervalidasi           │
│  GameClient (game/)              │   JSON   │   ├─ core/   clock, logger, lifecycle  │
│                                  │          │   ├─ game/   GameServer, map/collision (Fase 4), tick (Fase 10)│
│  render/  PixiJS, kamera, aset   │          │   └─ ports/  interface saja (TODO)     │
│  Fase 3+: input, gerak, state    │          │                                        │
└───────────────┬──────────────────┘          └───────────────────┬────────────────────┘
                │ selalu same-origin                              │ adapter: Fase 11-12
                ▼                                                 ▼
  dev   : Vite dev server meneruskan /api                 PostgreSQL (belum ada)
  prod  : reverse proxy (Fase 15)

   packages/shared  ◀── diimpor KEDUA sisi: konstanta, skema zod, tipe pemain,
                        protokol, logging core, error, GameConfig
```

Klien **selalu memanggil origin-nya sendiri** (`/api/...`). Di development, Vite meneruskan permintaan itu ke server (`apps/client/vite.config.ts`). Akibatnya:

- kode browser tidak perlu tahu alamat server (tidak ada yang bocor atau salah konfigurasi),
- tidak butuh CORS, dan cookie sesi (Fase 11) tetap _first-party_,
- tetap bekerja tanpa perubahan dari ponsel di Wi-Fi yang sama.

Soket realtime (Fase 10) akan memakai pola yang sama lewat `/ws`.

## 3. Prioritas arsitektur dan lokasinya

Urutan prioritas yang ditetapkan untuk proyek ini, dan di mana tiap komponen berada:

| #   | Komponen               | Lokasi                                                                | Fase | Kondisi sekarang                                                                                                                 |
| --- | ---------------------- | --------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Client                 | `apps/client` (`main.ts`, `game/`)                                    | 1, 2 | **Ada:** kerangka, entry point `GameClient`, konfigurasi, logging, error; layar boot memakai respons server asli                 |
| 2   | Game renderer          | `apps/client/src/render/`                                             | 2    | **Ada:** PixiJS renderer, camera, tile/object/actor/effect views, scene diff, chunk culling                                      |
| 3   | Input system           | `apps/client/src/input/` + `apps/client/src/game/PlayerController.ts` | 3-4  | **Ada:** keyboard/D-pad intent, fixed-step movement dan collision adapter klien                                                  |
| 4   | Game state             | klien: `src/game/`; server: `src/game/`                               | 3-6  | **Ada lokal:** player state, movement/collision; GameServer memuat Greenhaven dan validator collision, tanpa tick/entitas server |
| 5   | Multiplayer networking | klien: `src/net/GameConnection.ts`; server: gateway WebSocket         | 10   | **Interface** `GameConnection` + tipe pesan & registry di `shared`; belum ada implementasi, tidak ada soket                      |
| 6   | Backend server         | `apps/server` (`main.ts`, `game/`)                                    | 1    | **Ada:** entry point `GameServer`, HTTP, keamanan dasar, konfigurasi, logging, graceful shutdown                                 |
| 7   | Database               | `apps/server/src/ports/` + adapter                                    | 11   | **Interface** (TODO)                                                                                                             |
| 8   | Authentication         | `apps/server/src/ports/auth.ts`                                       | 11   | **Interface** `AuthService` (TODO). Tidak ada rute `/api/auth/*` sama sekali                                                     |
| 9   | Persistence            | `apps/server/src/ports/characters.ts`, `ports/world.ts`               | 12   | **Interface** `CharacterRepository`, `WorldRepository` (TODO)                                                                    |

## 4. Struktur monorepo dan aturan dependensi

```
arena/
├─ apps/
│  ├─ client/                     Klien browser (Vite + TypeScript)
│  │  ├─ index.html, public/
│  │  ├─ vite.config.ts           proxy /api, allowedHosts, define __APP_VERSION__
│  │  └─ src/
│  │     ├─ main.ts               entry point: baca config, pasang logger + error handler,
│  │     │                        rakit GameClient dan BootScreen
│  │     ├─ globals.d.ts          deklarasi tipe untuk __APP_VERSION__ (disuntik Vite)
│  │     ├─ game/                 GameClient: composition root + siklus hidup klien
│  │     ├─ ui/                   DOM: BootScreen, FatalErrorScreen, dom.ts (el), format.ts, styles.css
│  │     ├─ boot/                 BootController (handshake) + ClientState (tipe state UI)
│  │     ├─ net/                  ApiClient, health, GameConnection (TODO Fase 10)
│  │     ├─ core/                 backoff, logger (sink console), globalErrors
│  │     └─ config/               clientConfig.ts: env Vite tervalidasi + GameConfig
│  └─ server/                     Server game (Fastify + TypeScript)
│     ├─ scripts/build.mjs        bundel produksi (esbuild) -> dist/main.js
│     └─ src/
│        ├─ main.ts               entry point proses: env, sinyal, exit code
│        ├─ game/                 GameServer + WorldMap: lifecycle dan map/collision validator
│        ├─ http/                 buildApp.ts, plugins/security.ts, routes/health.ts, errors.ts
│        ├─ config/               env.ts: skema zod + nilai default aman + GameConfig
│        ├─ core/                 clock.ts (Clock bisa disuntik), logger.ts (pino + startup)
│        └─ ports/                interface auth/characters/world (TODO)
├─ packages/
│  └─ shared/                     @project-realm/shared: kontrak klien-server
│     └─ src/
│        ├─ api/                  kontrak HTTP (health, error)
│        ├─ config/               GameConfig: aturan main yang sama di kedua sisi
│        ├─ entities/             PlayerState, PlayerId, aturan nama pemain
│        ├─ world/                Position, Direction, TileCollision, map Greenhaven
│        ├─ protocol/             MapData zod (Fase 4); envelope pesan (Fase 10)
│        ├─ logging/              level + core logger (sink disediakan tiap aplikasi)
│        └─ errors/               RealmError + toErrorDetails
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
klien :  main ──▶ game ──▶ ui ──▶ boot ──▶ render ──▶ net ──▶ core
                    ├────▶ input ─────────────▶ shared
                    └────▶ physics ───────────▶ shared
server:  main ──▶ game ──▶ http ──▶ config | core | ports
```

`render` (renderer, kamera, tekstur, deskripsi scene) berada **di bawah** `ui` dan `boot`: renderer tidak boleh tahu apa-apa soal handshake atau layar. `WorldStage` (`game/`) merakit renderer dan input; `WorldSession` menghubungkan controller gerak dengan collision resolver. `input/` menghasilkan intent dan `physics/` mengonsumsi shared map data—keduanya tidak mengimpor renderer. `WorldScreen` (`ui/`) hanya menampilkan data, dan `render/` tidak mengimpor `net`, `boot`, `ui`, maupun `game` — aturan yang dijalankan ESLint.

`game` memegang entry point (`GameClient`, `GameServer`): boleh memakai semua lapisan di bawahnya, dan tidak ada lapisan bawah yang boleh mengimpor balik ke atas. Alasannya praktis: lapisan bawah bisa diganti atau dites tanpa lapisan di atasnya. Misalnya `BootController` (lapisan `boot`) dites penuh tanpa DOM, `ApiClient` (lapisan `net`) dites dengan `fetch` yang disuntikkan, dan `GameServer` dites dengan soket sungguhan di port acak.

Aturan ini dijalankan ESLint, dan **terbukti menggigit**: saat `http/app.ts` diubah namanya dari `src/app.ts`, aturan `**/app` menolak impor `./app` dari lapisan `http` (karena `app` adalah nama lapisan terlarang) — berkas itu kini bernama `http/buildApp.ts` sesuai fungsi yang diekspornya.

> **Kenapa state ada di `boot/`, bukan di `game/`:** `ui/BootScreen` menampilkan `ClientState` (`boot/clientState.ts`). Kalau tipe itu tinggal di `game/`, lapisan `ui` harus mengimpor _ke atas_ ke `game` dan melanggar arah dependensi di atas.

Hasil pengujian aturan: 10 impor terlarang (termasuk impor relatif bertingkat `../../ui/dom`) ditolak ESLint, dan 3 impor yang sah tidak ditolak.

## 5. Alur boot klien

`GameClient` (`game/GameClient.ts`) adalah **entry point** klien: ia memegang konfigurasi, logger, dan siklus hidup (`start()`, `stop()`, `retryNow()`, `subscribe()`), serta merakit `BootController` sebagai rekan yang menjalankan handshake. `BootController` sendiri tetap _state machine_ murni (tanpa DOM, tanpa global); `BootScreen` hanya menampilkan state yang disiarkan `GameClient`. Perakitan seluruh modul ada di `src/main.ts`.

State yang dilihat UI adalah `ClientState` (`boot/clientState.ts`): `starting` → (`checking` | `online` | `incompatible` | `offline`) → `stopped`. Union ini tertutup: menambah state baru tanpa menangani di UI adalah error kompilasi.

Setelah handshake berhasil, klien berstatus **online** dan `main.ts` menyalakan **sesi dunia lokal** (`startWorld` → `WorldStage`): renderer PixiJS, kamera, Greenhaven dari map data bersama, serta input/movement/collision lokal. Ini belum dunia server-authoritative — tidak ada soket gameplay (Fase 10), akun (Fase 11), maupun pemain lain. HUD menampilkan nama area aktif dan informasi debug.

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

| Port                              | File                                    | Fase  | Entitas basis data terkait             |
| --------------------------------- | --------------------------------------- | ----- | -------------------------------------- |
| `AuthService`                     | `apps/server/src/ports/auth.ts`         | 11    | User                                   |
| `CharacterRepository<TPersisted>` | `apps/server/src/ports/characters.ts`   | 11-12 | Character, Inventory, Equipment, Quest |
| `WorldRepository<TZoneState>`     | `apps/server/src/ports/world.ts`        | 12    | data dunia yang persisten              |
| `GameConnection<TIntent, TEvent>` | `apps/client/src/net/GameConnection.ts` | 10    | (jaringan, bukan basis data)           |

Selain itu ada satu port **yang sudah punya implementasi**: `WorldRenderer` (`apps/client/src/render/WorldRenderer.ts`). Kontraknya (`init`, `apply`, `render`, `resize`, `setPixelated`, `destroy`) dipenuhi `PixiRenderer`, dan justru karena itu `WorldSession` dan seluruh logika dunia bisa dites di Node tanpa GPU — serta diganti renderer lain (canvas, atau renderer palsu di tes) tanpa menyentuh kode game.

**Protokol realtime belum ada, tetapi bentuknya sudah ditetapkan** (`shared/protocol/messages.ts`) supaya kedua sisi tidak menulis kontrak yang sama dua kali: satu _envelope_ (`v`, `kind`, `payload`) yang divalidasi `MessageEnvelopeSchema`, `MessageRegistry` (kind → skema payload), tipe `MessageOf`/`ClientIntent`/`ServerMessage`, serta `decodeMessageFrame`/`encodeMessageFrame` yang mengembalikan `null` (bukan melempar) untuk frame yang tidak dikenali. Registry pertama ditulis di Fase 10; sampai saat itu tidak ada satu pun jenis pesan yang dibuat-buat, dan **tidak ada soket** di seluruh kode.

Aturan keras: **port tanpa adapter berarti fitur belum ada.** Pemanggil harus memperlakukannya begitu. Jangan menambah implementasi "selalu sukses" untuk melancarkan pekerjaan UI. Port bersifat _generik_ (`TPersisted`, `TZoneState`) karena bentuk data karakter dan dunia baru dirancang di Fase 7-9; menebak field sekarang hanya akan membuat kita merobohkannya nanti. Entitas `Item` (definisi item) adalah keputusan terbuka: data statis di repo atau tabel basis data (lihat bagian 14).

## 9. Keamanan

### Sudah ada di Fase 1

| Kontrol                     | Detail                                                                                                                                                                        | Lokasi                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Bind lokal secara default   | `HOST=127.0.0.1`. Container atau server harus menyetel `0.0.0.0` secara eksplisit                                                                                             | `config/env.ts`                                      |
| Header keamanan             | `@fastify/helmet` (CSP, `nosniff`, HSTS, COOP/CORP, dll.). Berlaku untuk respons **API**; halaman klien statis butuh CSP sendiri di produksi                                  | `http/plugins/security.ts`                           |
| Rate limit global per IP    | 120 permintaan per 60 s (bisa diatur). Rute tak dikenal ikut dibatasi. IPv6 dikelompokkan per /64                                                                             | `http/plugins/security.ts`, `http/buildApp.ts`       |
| Batas ukuran body           | 16 KiB                                                                                                                                                                        | `http/buildApp.ts`                                   |
| Error handler terpusat      | 5xx selalu generik; detail hanya di log                                                                                                                                       | `http/buildApp.ts`                                   |
| Redaksi log                 | `authorization`, `cookie`, `set-cookie` disensor                                                                                                                              | `http/buildApp.ts`                                   |
| Env divalidasi, gagal cepat | Nilai salah menghentikan server dengan pesan yang menyebut variabel mana yang keliru                                                                                          | `config/env.ts`                                      |
| `TRUST_PROXY=false`         | Header `X-Forwarded-*` tidak dipercaya kecuali server berada di belakang proxy milik sendiri (kalau tidak, IP bisa dipalsukan)                                                | `config/env.ts`                                      |
| Same-origin, tanpa CORS     | Tidak ada `@fastify/cors`. Vite dev server menolak header `Host` asing (403) sebagai perlindungan DNS-rebinding                                                               | `vite.config.ts`                                     |
| Tidak ada rahasia di klien  | Hanya variabel berawalan `VITE_` yang masuk ke bundel browser; satu-satunya yang dipakai adalah `VITE_LOG_LEVEL` (bukan rahasia) dan hanya nama variabel itu yang dibaca kode | `apps/client/.env.example`, `config/clientConfig.ts` |
| Render UI aman dari injeksi | Tidak ada `innerHTML`. Teks dari server selalu menjadi _text node_. Ada tes yang gagal bila aturan ini dilanggar                                                              | `ui/dom.ts`, `ui/BootScreen.ts`                      |

### Direncanakan (per fase)

- **Fase 10:** validasi zod untuk **setiap** pesan WebSocket, batas ukuran pesan, rate limit per koneksi, pemeriksaan header `Origin` pada _upgrade_, batas koneksi per IP.
- **Fase 11:** Argon2id untuk password, sesi di sisi server (token acak, disimpan ter-_hash_, dikirim hanya lewat cookie `HttpOnly` + `SameSite`), pemeriksaan `Origin` untuk perlindungan CSRF, rate limit login per IP **dan** per username.
- **Fase 13:** rate limit dan sanitasi chat.
- **Fase 14:** CSP untuk klien, tinjauan keamanan, uji beban, `npm audit` rutin di CI.
- **Fase 15:** TLS di reverse proxy, manajemen secret, pencadangan basis data.

## 10. Sistem konfigurasi dan variabel lingkungan

Konfigurasi punya **tiga lapisan**, dan nilainya mengalir satu arah: nilai default → variabel lingkungan → objek konfigurasi beku yang dipakai kode.

```
packages/shared/config/gameConfig.ts     aturan yang HARUS sama di kedua sisi (GameConfig)
        │  createGameConfig(overrides): validasi zod, dibekukan (Object.freeze)
        ├──────────────────────────────┐
        ▼                              ▼
apps/server/src/config/env.ts     apps/client/src/config/clientConfig.ts
  process.env + .env tervalidasi    import.meta.env (hanya VITE_*) tervalidasi
        │                              │
        ▼                              ▼
  AppConfig (beku)               ClientConfig (beku)
   → GameServer                    → GameClient
```

- **`GameConfig`** (shared) berisi angka yang tidak boleh berbeda antara klien dan server: `protocolVersion` dan kontrak langkah tetap (`simulation.hz`, `simulation.maxCatchUpSteps`). Satu definisi, dipakai dua sisi; tidak ada angka yang ditulis dua kali. `protocolVersion` hari ini dipakai untuk handshake `/api/health`; angka simulasi baru dipakai saat renderer (Fase 2) dan tick server (Fase 10) ada.
- **Nilai default aman**, dan objek hasilnya **dibekukan**: tidak ada bagian game yang bisa menulis ulang aturan di tengah jalan.
- **Salah konfigurasi = gagal cepat.** Baik server maupun klien melempar `RealmError` dengan kode `config_invalid` yang menyebut setiap variabel yang salah, bukan diam-diam memakai nilai lain.
- **Variabel di luar daftar diabaikan**, sehingga salah ketik tidak mengubah pengaturan lain diam-diam.

**Server** membaca variabel berikut (semua opsional). Template: `apps/server/.env.example`; salin menjadi `apps/server/.env` (diabaikan git, dan berkas `.env` dimuat lebih dulu daripada environment proses... justru sebaliknya: variabel yang sudah ada di environment sistem **selalu menang**).

| Variabel                    | Default       | Validasi                                                     |
| --------------------------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`                  | `development` | `development`, `test`, atau `production`                     |
| `HOST`                      | `127.0.0.1`   | tidak boleh kosong                                           |
| `PORT`                      | `3001`        | bilangan bulat 1-65535                                       |
| `LOG_LEVEL`                 | `info`        | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |
| `TRUST_PROXY`               | `false`       | boolean (`true`/`false` dan padanannya)                      |
| `HTTP_RATE_LIMIT_MAX`       | `120`         | bilangan bulat positif                                       |
| `HTTP_RATE_LIMIT_WINDOW_MS` | `60000`       | bilangan bulat, minimal 1000                                 |

Kosakata level log (`LOG_LEVEL`) berasal dari `shared/logging/levels.ts`, daftar yang sama yang divalidasi klien, jadi `warn` berarti satu hal di seluruh proyek.

**Klien** hanya membaca variabel yang memang sampai ke browser, yaitu yang berawalan `VITE_` (aturan Vite, bukan pilihan proyek). Template: `apps/client/.env.example`.

| Variabel               | Default                                        | Keterangan                                                             |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `VITE_LOG_LEVEL`       | `debug` di dev build, `info` di build produksi | Ambang log di console browser pemain                                   |
| `DEV_API_PROXY_TARGET` | `http://127.0.0.1:3001`                        | **Hanya** dibaca `vite.config.ts` (sisi Node); tidak pernah ke browser |
| `DEV_ALLOWED_HOSTS`    | kosong                                         | Nama host tambahan yang boleh dijawab dev server (dipisah koma)        |

Alamat server **tidak** bisa dikonfigurasi dari browser: klien selalu memanggil origin-nya sendiri (`/api/...`), dan dev server atau reverse proxy yang meneruskan. Alamat proxy memakai `127.0.0.1`, bukan `localhost`, karena di Windows `localhost` bisa di-resolve ke IPv6 `::1` sementara server mendengarkan IPv4. Vite juga menolak permintaan dengan nama host yang tidak dikenal (perlindungan DNS-rebinding); `DEV_ALLOWED_HOSTS` (dan `.e2b.app` untuk sandbox pengembangan) membuka pengecualian secara sadar.

**Rahasia tidak pernah ada di klien.** Apa pun yang berawalan `VITE_` ikut terkirim ke browser setiap pemain. Nama variabel rahasia (mis. `DATABASE_URL`, kunci sesi) nanti hanya ada di `apps/server/.env`.

## 11. Siklus hidup, logging, dan observabilitas server

**Siklus hidup.** `GameServer` (`game/GameServer.ts`) memiliki HTTP app dan statusnya:

```
created ──start()──▶ starting ──listen berhasil──▶ running ──stop()──▶ stopping ──▶ stopped
                          │
                          └──listen gagal──▶ stopped (RealmError: port_unavailable)
```

- `main.ts` (entry point proses) hanya mengurus hal tingkat proses: memuat `.env`, membaca konfigurasi, memasang handler sinyal dan error fatal, memanggil `start()`, mencatat kegagalan, lalu keluar dengan kode yang bisa ditindaklanjuti _supervisor_.
- **Graceful shutdown:** `SIGINT` (Ctrl+C), `SIGTERM`, dan `SIGBREAK` (Windows) memicu `server.stop()` → `app.close()` → keluar dengan kode 0. Jika macet, proses dipaksa keluar setelah 10 detik. Fase berikutnya mengaitkan penutupan game loop dan penyimpanan data lewat hook `onClose` Fastify.
- **Kegagalan tak terduga:** `uncaughtException` dan `unhandledRejection` dicatat sebagai `fatal`, server ditutup rapi, lalu keluar dengan kode 1.
- **Gagal start:** port dipakai (`EADDRINUSE`) atau ditolak (`EACCES`, umum di Windows) menjadi `RealmError('port_unavailable')` dengan pesan yang menyebut solusinya. Server tidak pernah tertinggal di status `starting` seolah masih akan hidup.
- Status dan alamat bisa dibaca tanpa efek samping: `getState()`, `getAddress()` (bermanfaat saat port `0`, dipakai tes).

**Logging.** Satu kosakata dan satu _facade_ untuk kedua sisi:

```
packages/shared/logging/   level (trace…fatal, silent) + createLogger({ name, threshold, sink })
        │
        ├─ klien  apps/client/src/core/logger.ts   → console browser (context sebagai objek,
        │                                              Error asli supaya stack bisa diklik)
        └─ server apps/server/src/core/logger.ts   → pino milik Fastify (JSON), dan
                                                     createStartupLogger untuk fase sebelum pino ada
```

- Kode game **tidak pernah** memanggil pino atau `console` langsung. Di klien, hanya `core/logger.ts` yang boleh menyentuh `console` (aturan ESLint).
- Level disaring sekali di _core_ bersama, jadi `isEnabled()` jujur dan pemanggil bisa melewati pembuatan context yang mahal.
- `child('boot')` menghasilkan nama bertitik (`client.boot`, `server.http`), sehingga asal sebuah baris log bisa dibaca tanpa membuka kode.
- Nilai yang dilempar (`catch`) dilampirkan **apa adanya** ke record: pino menyerialisasinya dengan seri Error-nya, sedangkan klien menaruh Error asli di console. `toErrorDetails` (shared) menyediakan bentuk JSON yang aman untuk _sink_ yang butuh (mis. startup logger) dan untuk lemparan non-Error (string, `null`, objek melingkar).
- Pino **meredaksi** header sensitif (`authorization`, `cookie`, `set-cookie`) — lihat `http/buildApp.ts`.

## 12. Strategi pengujian

- Tes berada di samping kodenya (`*.test.ts`), dijalankan Vitest per workspace. `npm test` menjalankan semuanya, dan `npm run check` menambah typecheck, lint, dan cek format.
- Dependensi **disuntikkan**, bukan di-_mock_ secara global: `fetch` ke `ApiClient`, `Clock` ke server, objek env ke `loadConfig`. Waktu dikendalikan dengan _fake timers_.
- DOM dites dengan `happy-dom` (dipilih ketimbang `jsdom` karena `jsdom` 30 mensyaratkan Node >= 22.22.2, lebih tinggi dari `engines` proyek).
- Tes keamanan dibuktikan bisa gagal: kode diubah sementara agar memakai `innerHTML`, dan tes yang relevan harus merah sebelum kode dikembalikan.
- Entry point dites sungguhan, bukan disimulasikan: `GameServer` membuka soket TCP di port acak (`port: 0`) lalu diambil dengan `fetch` dan divalidasi dengan skema bersama; port yang sudah dipakai diuji dengan benar-benar menabrak dua server. `GameClient` dites dengan `ApiClient` yang `fetch`-nya disuntikkan dan waktu palsu (`vi.useFakeTimers`).
- **Renderer dites tanpa GPU.** `render/` dan `game/` murni TypeScript: `diffScene`, `Camera`, `AssetLoader`, `GameLoop`, `WorldSession`, dan `WorldStage` diuji di Node (dengan `WorldRenderer` palsu yang mencatat panggilan). `manifests.test.ts` membandingkan manifest dengan konstanta generator aset, sehingga gambar dan kode tidak bisa menyimpang diam-diam.
- **Yang tidak bisa dites tanpa browser** adalah hal yang memang milik browser: apakah WebGL benar-benar menggambar, seberapa halus rasanya, dan apakah resize terasa benar. Karena itu pemilik proyek memverifikasinya dengan membuka `npm run dev`, dan tes otomatis berbasis browser (Playwright) tetap **ditunda** sesuai keputusan Fase 2.
- CI (`.github/workflows/ci.yml`): `npm ci`, `npm run check`, `npm run build` pada Ubuntu dan Windows, Node 22 dan 24. Sudah berjalan di GitHub dan hijau pada PR #2 (empat job, 25-73 detik).

## 13. Cara menambah fitur (resep)

**Tile, objek, karakter, atau efek baru**

Ikuti [ASSETS.md](ASSETS.md): gambar di `scripts/assets/*.mjs` (dari palet proyek), daftarkan di `*_ORDER`, samakan `SHEETS` di `apps/client/src/render/manifests.ts`, lalu `npm run assets` dan `npm run check`. Tes manifest akan menolak manifest dan gambar yang tidak sinkron.

**Endpoint HTTP baru**

1. Tambahkan path dan skema respons/permintaan di `packages/shared/src/api/` lalu ekspor dari `index.ts`.
2. Buat modul rute di `apps/server/src/http/routes/` (fungsi `registerXxxRoute(app, deps)`) dan daftarkan di `buildApp` (`http/buildApp.ts`).
3. Panggil dari klien lewat `ApiClient.get(path, skema)` di lapisan `net/`, sehingga respons divalidasi.
4. Tulis tes di kedua sisi. Jika kontrak lama rusak, naikkan `PROTOCOL_VERSION`.

**Adapter untuk sebuah port**

Implementasikan interface di `ports/` pada folder baru (mis. `adapters/postgres/`), lalu suntikkan lewat `buildApp`. Kode game tetap hanya mengenal interface-nya.

**Modul klien baru**

Letakkan di lapisan yang tepat (bagian 4.2), rakit di `game/GameClient.ts` atau `main.ts`, dan jangan impor "ke atas". Bila sebuah modul butuh impor ke atas, itu tanda desainnya perlu diubah (biasanya tipe atau interface pindah ke lapisan bawah).

**Pengaturan baru**

Kalau angkanya harus sama di kedua sisi, tambahkan ke `GameConfig` (`shared/config/gameConfig.ts`) dan pakai `createGameConfig()` di kedua aplikasi. Kalau hanya berlaku di satu sisi, tambahkan ke skema env aplikasi itu (`apps/server/src/config/env.ts` atau `apps/client/src/config/clientConfig.ts`) beserta barisnya di `.env.example`; skema zod adalah satu-satunya tempat variabel itu dibaca.

## 14. Keputusan yang sengaja ditunda

| Keputusan                                   | Diputuskan di                                      | Opsi yang dipertimbangkan                                                                                               |
| ------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Renderer 2D                                 | **Fase 2 — diputuskan: PixiJS 8**                  | PixiJS (renderer saja, cocok dengan pemisahan modul) vs framework game penuh                                            |
| Model gerak dan prediksi                    | Fase 3                                             | fungsi gerak deterministik di `shared`, dipakai klien dan server                                                        |
| Format peta                                 | **Fase 4 — diputuskan: format data sendiri + zod** | JSON-friendly, tile ID semantik, layer tile/collision/object, spawn, area, dan boundary (dipakai) vs import Tiled penuh |
| Framework UI untuk overlay (HUD, inventori) | Fase 7                                             | DOM helper `el()` yang ada, vs Preact + signals                                                                         |
| Transport dan protokol realtime             | Fase 10                                            | WebSocket mentah + protokol sendiri di `shared` (bawaan), vs framework room                                             |
| Basis data dan lapisan akses                | Fase 11                                            | PostgreSQL dengan Drizzle, Kysely, atau Prisma; opsi lebih ringan untuk dev lokal                                       |
| Definisi `Item`: data statis atau tabel     | Fase 7/11                                          | berkas data tervalidasi di repo vs tabel basis data                                                                     |
| Sumber aset visual                          | **Fase 2 — diputuskan: generator di repo**         | skrip generator + palet sendiri (dipakai) vs aset berlisensi dari luar                                                  |

## 15. Perubahan terhadap rencana yang diposting sebelum coding

| Rencana awal                            | Yang dibangun                                                 | Alasan                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `BootController` di `src/app/`          | `src/boot/`                                                   | Menjaga arah dependensi `game → ui → boot → net → core` (bagian 4.2)                                                               |
| Bundel server dengan `tsup`             | Skrip esbuild: `apps/server/scripts/build.mjs`                | README `tsup` menyatakan proyeknya tidak lagi dirawat; esbuild adalah dasar yang sama tanpa lapisan tambahan                       |
| Scope paket `@realm/*`                  | `@project-realm/*`                                            | `@realm` dipakai MongoDB Realm; `@project-realm` terbukti bebas di npm (E404)                                                      |
| (belum direncanakan)                    | `happy-dom` (devDependency klien) dan aturan ESLint pelapisan | Agar lapisan UI punya tes permanen dan klaim "arah dependensi satu arah" benar-benar ditegakkan                                    |
| `apps/server/src/app.ts`                | `src/http/buildApp.ts`                                        | `buildApp()` tinggal di lapisan `http`, dan nama `app` dipakai aturan lint sebagai lapisan terlarang untuk impor ke atas           |
| `apps/client/src/app/startApp.ts`       | `src/game/GameClient.ts` + `src/main.ts`                      | Entry point yang eksplisit (`GameClient`) dengan siklus hidup, logging, dan state bertipe; `main.ts` hanya merakit                 |
| `network message types` ditunda Fase 10 | envelope + registry + tipe pesan di `shared/protocol/`        | Kontrak bersama lebih murah ditulis sebelum dua sisi mengimpor sesuatu; tidak ada transport atau pesan palsu yang ikut dibuat      |
| Aset dari perancang/aset pihak ketiga   | Generator aset sendiri (`scripts/assets/`)                    | Fase 2 butuh gambar untuk menguji renderer; menggambarnya dari palet sendiri menjaga kebijakan orisinalitas tanpa menunggu seniman |
| Fog peta prototipe memakai tile awan    | Diganti peta bersama `Greenhaven` di Fase 4; fog dilepas      | Fog pernah menguji pembaruan tile per lapisan, lalu digantikan oleh map data, collision, area, dan layer dunia yang sesungguhnya   |

## 16. Penanganan error

Dua keluarga error, dipisahkan karena pemanggilnya butuh hal yang berbeda:

| Keluarga              | Kelas                                  | Untuk                                                                              | Yang dibawa                                                                               |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Error aplikasi        | `RealmError` (`shared/errors/`)        | konfigurasi salah, siklus hidup dipakai di urutan salah, port tidak bisa dipakai   | `code` stabil (`config_invalid`, `invalid_state`, `port_unavailable`), `context`, `cause` |
| Error satu permintaan | `ApiError` (`client/net/ApiClient.ts`) | permintaan HTTP gagal: `network`, `timeout`, `aborted`, `http`, `invalid-response` | `kind`, `status`, pesan yang bisa ditampilkan                                             |

- Turunan `RealmError` yang sudah ada: `ConfigError` (server) dan error yang dilempar `createGameConfig`/`readClientConfig`. `isRealmError()` adalah cara aman mengeceknya dari nilai `unknown` hasil `catch`.
- **Perbatasan tidak melempar ke UI.** `decodeMessageFrame` mengembalikan `null`, `ApiError` diklasifikasikan di lapisan `net`, dan `BootController` mengubah error apa pun menjadi `reason` bertipe yang bisa ditampilkan — UI tidak pernah memeriksa `/error/i.message/`.
- **Klien:** `installGlobalErrorHandlers` (`core/globalErrors.ts`) mengirim `error` dan `unhandledrejection` yang lolos ke logger. Handler ini hanya **melaporkan**; ia tidak mencoba memulihkan state yang sudah tidak diketahui lagi. Kegagalan saat start (konfigurasi tidak valid) ditangkap di `main.ts` dan ditampilkan lewat `FatalErrorScreen` — pesan sebagai teks, bukan HTML.
- **Server:** `uncaughtException`/`unhandledRejection` → log `fatal` → shutdown rapi → exit 1. 5xx ke klien selalu generik (`internal_error`), detailnya hanya di log server.
- **Logging error tidak boleh gagal:** `toErrorDetails()` menormalkan apa pun yang dilempar (Error, string, `null`, objek melingkar) menjadi bentuk JSON dengan kedalaman `cause` yang dibatasi, dan `ErrorDetails` sudah diuji bisa `JSON.stringify`.

## 17. Rendering 2D (Fase 2)

Renderer adalah bagian klien yang paling mudah menjadi kusut, jadi batasnya dibuat eksplisit: **logika dunia tidak tahu apa-apa soal PixiJS, dan renderer tidak tahu apa-apa soal server.**

```
WorldSession (game/)          render/                         PixiJS
  state dunia  ──diffScene──▶  RenderCommand[]  ──apply()──▶  PixiRenderer
  (tile, objek, aktor,         (data, bukan gambar)            (satu-satunya berkas
   efek, label)                                                  yang mengimpor pixi.js)
```

- **Deskripsi scene sebagai data.** `render/scene.ts` mendefinisikan `WorldScene` (lapisan tile, objek, aktor, efek, label dunia) dan `RenderCommand` (`layer-added`, `tiles-changed`, `actor-changed`, …). `diffScene(sebelum, sesudah)` membandingkan **identitas objek lebih dulu** dan hanya menghasilkan perintah untuk yang benar-benar berubah; perbandingan struktural dipakai sebagai cadangan. Hasilnya: pemain diam = nol perintah untuk pemain itu, satu karakter berjalan = satu perintah, dan seluruh fungsi diff dites di Node tanpa GPU.
- **Port `WorldRenderer`.** `init`, `apply`, `render`, `resize`, `setPixelated`, `destroy`. `PixiRenderer` adalah satu-satunya implementasi hari ini, tetapi `WorldStage` dan `WorldSession` tidak pernah menyebut namanya: tes menyuntikkan renderer palsu yang mencatat panggilan.
- **Lapisan gambar** hidup di renderer, bukan di logika: `RENDER_LAYERS` = `ground → decoration → objects → characters → npcs → monsters → effects → world-ui`. Tile ID semantik dipetakan ke manifest oleh `TileLayerView`; collision layer tidak dirender. Objek punya `sortableChildren` dengan `zIndex = y`, sementara pemain, NPC, dan monster tetap di lapisan terpisah.
- **Koordinat.** `worldTiles → (× TILE_SIZE) → worldPixels → (kamera + zoom) → screenPixels`. Matematikanya di `packages/shared/src/render/camera.ts` beserta tesnya; kamera memakai satu transform pada container dunia, sehingga memindahkan kamera adalah satu penugasan posisi/skala per frame, bukan satu perulangan atas semua sprite. Semua hitungan game tetap dalam CSS piksel; _device pixel ratio_ hanya urusan renderer.
- **Loop dan delta time.** `GameLoop` (`game/GameLoop.ts`) adalah satu-satunya pemilik `requestAnimationFrame`; PixiJS dibuat dengan `autoStart: false` agar tidak ada jam kedua. Delta per frame dibatasi (maksimum 0,25 s) supaya tab yang lama tidak terlihat bisa "melompat", lalu `FixedTimestep` bersama mengubahnya menjadi langkah simulasi dengan batas _catch-up_; sisa waktu yang tidak bisa dikejar dilaporkan (HUD "Dropped time"), bukan disembunyikan.
- **Kamera.** Mengikuti titik tengah karakter dengan pemulusan eksponensial yang **tidak bergantung frame rate**, lalu dijepit ke bounds peta eksplisit (`clampToBounds`) sehingga pemain tidak pernah menatap kehampaan di luar dunia. Zoom default dipilih dari ukuran layar dan dibatasi 1-6×.
- **Resize dan DPR.** Satu `ResizeObserver` pada elemen canvas memanggil `handleResize()`: ukuran baru diserahkan ke renderer **dan** ke kamera, sedangkan resolusi gambar dibatasi `renderer.maxPixelRatio` (default 2). Layar tersembunyi (`visibilitychange`) menghentikan loop supaya tab latar tidak menggambar ke kanvas yang tak terlihat.
- **Culling.** Hanya chunk tile 16×16 yang bersinggungan dengan viewport (ditambah margin 2 tile) yang digambar, dan renderer mengembalikan hitungan nyata (`RenderStats`) untuk HUD. Greenhaven berukuran 72×48, dan tiap tile layer diculling secara independen.
- **Aset.** `AssetLoader` memuat lembar sprite lewat loader yang disuntikkan, melaporkan progres **nyata** (berkas selesai dari total, dipakai layar pemuatan), dan memvalidasi setiap rect frame terhadap tekstur sebelum digambar. Satu lembar di-upload sekali sebagai sumber bersama; setiap frame hanyalah `Texture` yang berbagi sumber itu. Asal-usul gambarnya: [ASSETS.md](ASSETS.md).

**Keterbatasan yang diketahui (jujur, bukan bug yang tak disadari):**

- Interpolasi render menjembatani fixed simulation step untuk gerak pemain lokal. Otoritas server, prediksi terhadap snapshot jaringan, dan rekonsiliasi tetap belum ada hingga Fase 10.
- Layer tile digambar sebagai `Sprite` per tile di dalam chunk, bukan `ParticleContainer`/mesh. Untuk satu zona ini lebih dari cukup; optimasi masuk Fase 14 setelah ada data nyata.
- Klien dan GameServer memuat Greenhaven dari data shared yang sama; server memakai shared collision validator untuk memeriksa posisi dan displacement. Belum ada intent jaringan, state pemain server, atau world tick hingga Fase 10. Fog prototipe Fase 2 telah dilepas agar map terlihat penuh.

## 18. Pergerakan pemain (Fase 3)

Fase ini menambahkan kontrol pemain **lokal/offline** di atas renderer. Tidak ada pesan gerak, WebSocket, akun, database, atau simulasi combat. Otoritas posisi baru akan ditambahkan di Fase 10.

```
keyboard / D-pad
       │
       ▼
input/InputController ── MoveIntent ──▶ game/PlayerController
                                           │
                      ┌────────────────────┴──────────────────┐
                      ▼                                       ▼
       shared/simulation/movement.ts               physics/Collision.ts
       langkah posisi kardinal                  resolver tile grid
                      └────────────────────┬──────────────────┘
                                           ▼
                          LocalPlayerState → WorldScene → renderer
```

- **State pemain:** `id`, `position` (tile units), `direction`, `movementState` (`idle`/`moving`), `speed` (tile/detik), `animationState` (`idle`/`walk`). State ini lokal dan tidak mengubah kontrak server-issued `PlayerState`.
- **Input:** WASD dan arrow keys menghasilkan empat arah kardinal. Kontrol yang paling baru ditekan menang; melepas satu tombol tidak membatalkan tombol lain yang masih ditahan. D-pad sentuh mengirim intent yang sama.
- **Gerak:** `movePosition()` adalah fungsi murni dan deterministik. Ia memakai speed bersama (`GameConfig.movement.playerSpeedTilesPerSecond`, default 4,2) dan delta fixed-step 20 Hz; berhenti langsung terasa saat intent dilepas.
- **Collision saat Fase 3:** resolver awal menerima grid walkable dan menyapu displacement. Fase 4 menggantinya dengan MapData tervalidasi yang menggabungkan sifat tile, collision layer, object colliders, dan boundary.
- **Render stabil:** controller menyimpan posisi simulasi; `WorldSession` merender interpolasi antara dua fixed-step terakhir dan mengarahkan kamera ke titik interpolasi yang sama. Keputusan gerak tetap pada fixed timestep.
- **Animasi:** state `idle`/`walk` dikirim eksplisit di `ActorState`; sprite mengatur animasi dan kembali ke frame netral saat idle.
- **Tes tanpa GPU:** fungsi gerak, controller, input (keyboard dan D-pad), collision sweep, scene diff, kamera, dan sesi dunia diuji terpisah.

## 19. Sistem dunia tile-based (Fase 4)

Dunia adalah data tervalidasi yang digunakan game logic dan renderer; bentuk map tidak ditulis di PixiJS.

```
packages/shared/src/world/maps/greenhaven.ts  →  MapDataSchema
           │                                       │
           ├── ground + decoration ────────────────┼─▶ WorldSession → WorldScene → PixiRenderer
           ├── collision mask + tile metadata ─────┼─▶ shared TileCollision ─▶ PlayerController
           ├── object layer + object colliders ─────┤                       └▶ ServerWorldMap
           ├── spawn points ────────────────────────┤
           └── bounds + named areas ────────────────┘
```

- **Format:** format sendiri yang JSON-friendly di `packages/shared/src/protocol/world.ts`. `MapDataSchema` memvalidasi grid row-major, tepat satu ground layer, maksimal satu decoration/collision/object layer, ID unik, referensi tile, map bounds, named areas, spawn points, dan colliders. Tile ID adalah semantik (mis. `grass` atau `water`), bukan indeks atlas; `TileData.blocksMovement` menentukan sifat tile.
- **Map Greenhaven:** map orisinal berukuran 72×48 dengan Heartwood Grove, Bracken Meadow, Old Quarry, Moonmere Shore, Greenhaven Village, dan South Fields. Data ada di `packages/shared/src/world/maps/greenhaven.ts`; map memiliki ground, decoration, collision, object layer, player spawn serta named transition spawn points.
- **Pemisahan layer:** ground dan decoration menjadi `TileLayerState` yang diculling per chunk. Collision layer tetap di MapData dan tidak dirender. Objects dirakit menjadi `ObjectState`; `TileLayerView` menerjemahkan ID semantik ke frame manifest. Renderer hanya menerima scene data.
- **Collision:** `TileCollision` memeriksa `TileData.blocksMovement`, explicit `CollisionData.solid`, collider AABB object-relative (relatif ke bottom-centre anchor), dan map bounds. Movement disapu dalam langkah kecil agar tidak menembus air, walls, rocks, buildings, atau tepi peta. Rendering dan indeks tileset tidak menentukan aturan collision.
- **Bounds dan area:** `MapData.bounds` memakai koordinat tile dengan tepi kanan/bawah eksklusif; collision menjaga seluruh body pemain tetap di dalam batas, dan `Camera.clampToBounds()` memakai boundary yang sama. Area aktif dihitung dari posisi pemain dan ditampilkan di HUD. Spawn point bertipe `transition` tersedia dalam data, tetapi sistem perpindahan antar-map belum dibangun.
- **Aset asli:** tile set memuat stone-wall dan bridge-plank, object sheet memuat cottage; aset dibangun ulang oleh generator deterministik dan urutannya diverifikasi terhadap manifest.
- **Server:** `GameServer` membuat `ServerWorldMap`, memvalidasi MapData Greenhaven saat startup, dan memakai `TileCollision` shared untuk menguji posisi serta menyapu displacement terhadap rules yang sama dengan klien. Tidak ada tick, player entity, network intent, maupun perpindahan antar-map; otoritas atas gerak pemain multiplayer tetap Fase 10.
- **Scope:** map dan collision validator tersedia pada kedua sisi, tetapi tidak ada gameplay multiplayer, NPC server-authoritative, combat, database, maupun otoritas gerak jaringan yang dimulai.

## 20. Prototipe interaksi NPC lokal (slice Fase 5)

NPC dan percakapannya adalah data dunia, bukan aturan yang ditanam di renderer atau komponen React/DOM:

```
packages/shared/src/world/npcs/greenhaven.ts  →  NpcDataListSchema
            │                                      │
            ├── id/name/position/sprite/type ──────┼─▶ WorldSession → scene actors + NPC layer
            ├── interactionRadius ─────────────────┼─▶ NpcInteractionSystem → nearest in-range NPC
            └── dialogue node graph ────────────────┴─▶ NpcDialogueState → DialoguePanel
```

- **Kontrak:** `packages/shared/src/protocol/npc.ts` mendefinisikan role `merchant`, `quest_giver`, dan `generic`, data NPC dengan posisi/sprite/jangkauan, node linear/bercabang, pilihan pemain, serta proyeksi untuk HUD/UI. Zod memvalidasi ID unik, node awal, dan referensi transisi sebelum data Greenhaven dipakai.
- **Konten:** `packages/shared/src/world/npcs/greenhaven.ts` berisi tiga karakter orisinal—Village Elder (`quest_giver`), Merchant (`merchant`), dan Guard (`generic`)—beserta percakapan. Factory menghasilkan data tervalidasi baru per sesi. Tidak ada transaksi toko atau penyelesaian quest.
- **Jarak/interaksi:** `NpcInteractionSystem` menghitung NPC terdekat di dalam interaction radius; pemain menekan E atau tombol Talk. Linear nodes berlanjut dengan E/Continue; pilihan memindahkan graph ke node lain atau menutup dialogue. Movement lokal dijeda selama panel terbuka dan intent terakhir dipulihkan setelah panel ditutup.
- **Batas UI/render:** `WorldSession` membuat actor scene dari shared data dan menambahkan prompt berbasis jarak. PixiJS menerima actor layer eksplisit (`characters` atau `npcs`) dan tidak memilihnya dari pola ID. `DialoguePanel` menerima view-model dan hanya merender nama, baris, serta pilihan yang datang dari graph; tidak menyimpan cerita karakter.
- **Aset:** actor sheet deterministik punya penampilan `elder`, `merchant`, dan `guard`; ID data dan manifest diuji agar tetap sinkron.
- **Batas slice NPC:** karakter NPC statis dan dialog berjalan lokal di browser. Belum ada NPC server-authoritative, quest completion, transaksi toko, database, atau persistence. Sistem monster lokal dijelaskan pada bagian berikutnya; Fase 5 penuh tetap belum selesai.

## 21. Sistem monster lokal (slice Fase 5)

Data statis menentukan spawn/statistik/rute; empat modul runtime memisahkan entity, keputusan AI, combat, dan siklus spawn:

```
shared/world/monsters/greenhaven.ts → MonsterDataListSchema
           │
           ▼
MonsterSpawner → MonsterEntity ← MonsterAI → shared TileCollision
                         │                    ▲
                         └── MonsterCombat ───┴── local player position/HP
                                   │
                                   └── WorldSession → monsters render layer + HP labels
```

- **Entity/data:** `packages/shared/src/protocol/monster.ts` memvalidasi ID/type, posisi tile, sprite, maxHP, level, movementSpeed, detectionRadius, attackRange, attackCooldown, damage, delay respawn, dan patrol waypoints. `MonsterEntity` membuat HP runtime dari maxHP dan menyimpan state uppercase `IDLE`, `PATROL`, `CHASE`, `ATTACK`, `HURT`, `DEAD`.
- **Konten original:** `packages/shared/src/world/monsters/greenhaven.ts` menyediakan Forest Slime, Wild Boar, dan Thorn Wolf dengan statistik serta rute masing-masing. Spawn dan seluruh waypoint diuji agar berada di area yang bisa ditempati.
- **AI:** `MonsterAI` menunggu saat idle, bergerak di antara waypoint, mendeteksi pemain dengan radius, mengejar dalam garis lurus, beralih ke attack range, dan kembali patroli jika pemain menjauh. `TileCollision` membatasi gerakan. AI sengaja sederhana—tidak ada pathfinding/navmesh.
- **Combat:** `MonsterCombat` menerapkan attack cooldown/damage ke pemain dan menerima serangan pemain terdekat dengan Space atau tombol Attack. Serangan pemain prototipe: 12 damage, jangkauan 1,35 tile, cooldown 0,45 detik. Pemain memiliki HP lokal 100; HUD dan label monster menampilkan HP/status. Hit nonletal memakai HURT singkat; HP nol menjadi DEAD.
- **Spawner/respawn:** `MonsterSpawner` membuat satu entity per spawn definition saat sesi lokal dimulai, lalu menunggu respawnSeconds untuk memulihkan posisi awal, HP penuh, rute, dan state IDLE setelah monster DEAD.
- **Render:** setiap monster berada pada layer `monsters` terpisah, memakai actor sprite orisinal dan status warna hurt/attack/dead. Renderer hanya menerima `ActorState`; data/AI/combat tidak ada di PixiJS.
- **Batas slice:** simulasi berjalan lokal di browser pada fixed timestep; tidak ada server authority, sinkronisasi multiplayer, loot/quest, database, atau siklus kematian pemain. Monster prototype ini tidak menyelesaikan seluruh Fase 5 server-authoritative.
