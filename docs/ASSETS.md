# Aset visual (programmer art)

Fase 2 memerlukan gambar untuk membuktikan renderer bekerja. Dokumen ini menjelaskan **dari mana aset itu berasal, bagaimana ia dibuat ulang, dan mengapa ia belum bisa disebut seni final.**

## Statusnya jelas: programmer art

Semua gambar di `apps/client/public/assets/` adalah **placeholder buatan sendiri** yang digambar oleh skrip di repo ini. Fungsinya satu: menguji renderer, kamera, grid tile, urutan lapisan, dan pemuatan aset. Aset ini:

- **100% orisinal.** Setiap piksel digambar oleh `scripts/assets/*.mjs` dari palet proyek sendiri (`scripts/assets/palette.mjs`). Tidak ada sprite, tileset, palet, atau berkas dari game lain — termasuk **The World of Magic**, yang secara eksplisit dilarang dipakai. Tidak ada berkas yang di-jiplak, diwarnai ulang, atau diimpor.
- **Bukan seni final.** Ia akan diganti sebelum game ini punya wajah yang pantas ditunjukkan. Kebijakan orisinalitas penuh ada di [ORIGINALITY.md](ORIGINALITY.md).
- **Deterministik.** Tidak ada keacakan yang tidak di-seed, dan tidak ada operasi floating-point yang bisa berbeda antar mesin. Menjalankan generator dua kali menghasilkan berkas yang **byte-identik** (dibuktikan dengan sha256 yang dicetak setiap kali generate), sehingga `git diff` di folder aset selalu berarti perubahan nyata pada gambar.

## Cara membuat ulang

```
npm run assets
```

Menulis empat berkas ke `apps/client/public/assets/` dan mencetak ukuran, sha256, serta status `written`/`unchanged` untuk masing-masing. Skrip ini tidak punya dependensi: penulis PNG-nya adalah `scripts/assets/png.mjs` (zlib bawaan Node + ~60 baris), sehingga tidak ada paket gambar yang perlu dipasang atau diaudit.

Vite menyajikan folder `public/`, jadi berkas ini tersedia di `/assets/*.png` — baik saat `npm run dev` (`:5173`) maupun pada hasil build (`dist/assets/*.png`).

## Peta berkas

| Berkas        | Ukuran | Isi                                                                                                                        |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `tileset.png` | 96×16  | 6 tile tanah 16×16, satu baris: `grass`, `grass_flowers`, `dirt`, `water`, `stone`, `cloud`                                |
| `objects.png` | 128×32 | 4 objek dunia 32×32 (di-anchor di bawah, supaya boleh menjorok ke tile atasnya): `tree_broad`, `tree_pine`, `bush`, `rock` |
| `actors.png`  | 96×96  | 2 penampilan × 3 frame jalan × 4 arah, frame 16×24 (`player`, `villager`)                                                  |
| `effects.png` | 32×8   | 4 frame 8×8 untuk `dust` (puff langkah kaki)                                                                               |

Susunan baris pada `actors.png` (dari atas): **selatan, utara, timur, barat**. Arah barat adalah cermin dari timur, jadi keduanya dijamin konsisten.

## Kontrak antara gambar dan kode

`apps/client/src/render/manifests.ts` adalah satu-satunya tempat kode tahu **di mana** setiap frame berada. Setiap frame divalidasi terhadap tekstur yang benar-benar dimuat (`AssetLoader.frameIsInsideSheet`) sebelum digambar; kalau manifest dan gambar tidak cocok, dunia **menolak jalan** dengan pesan yang menyuruh menjalankan `npm run assets`, bukan menggambar sprite yang terpotong.

Karena itu, mengubah susunan gambar wajib mengubah manifest (dan sebaliknya) dalam satu langkah:

1. tambahkan painter di `scripts/assets/*.mjs` (dan, kalau perlu, warnanya di `palette.mjs`),
2. tambahkan id pada `TILE_ORDER` / `OBJECT_ORDER` / `ACTOR_ORDER` / `EFFECT_ORDER`,
3. samakan `SHEETS` di `apps/client/src/render/manifests.ts`,
4. jalankan `npm run assets`,
5. jalankan `npm run check` — tes `manifests.test.ts` membandingkan manifest dengan konstanta generator, sehingga ketidakcocokan jumlah/urutan/ukuran frame ketahuan sebelum masuk browser.

## Cara menambah aset

**Tile tanah baru** — tambahkan fungsi `paintXxx(canvas)` di `scripts/assets/tiles.mjs` dan daftarkan di `TILE_PAINTERS` + `TILE_ORDER`. Indeks di peta adalah posisi pada `TILE_ORDER`, jadi **jangan menyisipkan di tengah** tanpa memperbarui peta dan tes.

**Objek baru** — tambahkan painter di `scripts/assets/objects.mjs` (kanvas 32×32, gambar objek tumbuh ke atas dari tepi bawah) dan daftarkan di `OBJECT_ORDER`.

**Penampilan karakter baru** — tambahkan entri di `ACTOR_PALETTES` (`scripts/assets/actors.mjs`) dan `ACTOR_ORDER`. Tiga frame jalan dihasilkan dari satu deskripsi tubuh, sehingga tidak ada frame yang bisa lupa digambar.

**Efek kecil** — efek 8×8 ditulis sebagai **ASCII art** di `scripts/assets/effects.mjs`. Pada ukuran itu, pola eksplisit lebih mudah dibaca dan hasilnya lebih baik daripada menggambar elips secara prosedural (itu pelajaran nyata dari fase ini: versi prosedural pertama terlihat seperti gumpalan).

## Yang belum ada, dan disengaja

- Tidak ada animasi serang, mati, atau duduk (Fase 6+).
- Tidak ada autotiling/transisi tepi antar-biome: tile air dan tanah punya bingkai gelap sendiri. Autotiling 47-tile masuk bersama format peta dan tabrakan di Fase 4.
- Tidak ada atlas efisien/pengemasan; empat berkas kecil sudah benar untuk ukuran sekarang.
- Tidak ada pipeline kompresi atau CDN. Empat berkas ini totalnya di bawah 3 KB.
