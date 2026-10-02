# Kebijakan Orisinalitas

Project Realm harus **100% orisinal**: aset, karakter, nama, peta, sprite, kode, UI, dan konten berhak cipta lainnya tidak boleh disalin dari game lain.

Dokumen ini mengubah aturan itu menjadi hal yang bisa dicek. Ini kebijakan kerja proyek, bukan nasihat hukum.

## 1. "Terinspirasi" berarti apa

MMORPG klasik (misalnya The World of Magic) adalah **inspirasi genre**. Yang boleh dipakai adalah konsep umum yang menjadi bahasa bersama genre: level dan EXP, inventori, equipment, quest, monster dan loot, chat, respawn, dan sebagainya. Gagasan dan mekanik umum tidak dimiliki siapa pun.

Yang **tidak** boleh diambil adalah _ekspresi_ spesifik milik game tertentu:

| Tidak boleh                                                                                                      | Contoh                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Nama karakter, tempat, item, skill, faksi, atau monster dari game lain                                           | Memakai nama kota atau boss dari game yang sudah ada  |
| Sprite, tileset, ikon, musik, efek suara, atau animasi dari game lain (termasuk yang diekstrak atau "dirapikan") | Memotong spritesheet game lain lalu mewarnai ulang    |
| Tata letak peta, desain level, atau lore yang menjiplak game tertentu                                            | Menggambar ulang peta area awal sebuah game           |
| Tabel data spesifik (statistik item, kurva EXP, daftar drop) yang disalin                                        | Mengimpor tabel item dari wiki game lain              |
| Teks (dialog, deskripsi item, nama quest) yang disalin atau diparafrasekan tipis                                 | Menyalin deskripsi quest lalu mengganti beberapa kata |
| Tampilan UI yang meniru ciri khas visual game tertentu (_trade dress_)                                           | Menyalin susunan dan gaya HUD yang khas               |
| Kode sumber game lain, atau kode dari sumber bocor atau hasil dekompilasi                                        | Menempelkan potongan server emulator                  |

Aturan praktis: bila Anda perlu melihat game lain sambil membuat sesuatu agar "mirip", itu tanda sedang menjiplak. Mulailah dari kebutuhan desain proyek ini.

## 2. Aset (gambar, audio, font)

- **Dibuat sendiri**, atau berlisensi jelas yang mengizinkan **penggunaan komersial** dan redistribusi dalam game.
- Setiap aset tercatat dalam satu manifes (`docs/ASSETS.md`, dibuat bersama aset pertama di Fase 2) dengan: nama berkas, pembuat atau sumber, lisensi, dan tautan lisensi.
- **Aset hasil AI generatif:** periksa syarat layanan yang dipakai (hak penggunaan komersial dan kepemilikan keluaran), catat alat dan _prompt_, dan jangan pernah menulis _prompt_ yang meminta gaya atau tiruan game tertentu.
- **Font:** proyek ini memakai **font sistem saja** (tanpa permintaan jaringan ke pihak ketiga dan tanpa urusan lisensi font).
- Aset sementara (_programmer art_) boleh dipakai selama dikerjakan sendiri, ditandai jelas di manifes, dan diganti sebelum rilis.

Kondisi Fase 1: satu-satunya aset adalah `apps/client/public/favicon.svg`, bentuk geometris sederhana (segi enam dengan belah ketupat) yang dibuat khusus untuk proyek ini. Tidak ada gambar, audio, atau font eksternal.

## 3. Kode dan dependensi

- Kode ditulis untuk proyek ini. Potongan dari sumber lain (Stack Overflow, dokumentasi, contoh) hanya boleh bila lisensinya mengizinkan dan asalnya dicatat dalam komentar di dekatnya.
- Dependensi harus berlisensi permisif (MIT, Apache-2.0, ISC, BSD) atau bisa dibuktikan tidak ikut terkirim ke pemain. Peninjauan lisensi per 2026-10-02 ada di [TECH-STACK.md](TECH-STACK.md#lisensi): yang ikut ke bundel pemain hanya `zod` (MIT); satu-satunya lisensi _copyleft_ yang muncul (MPL-2.0, `lightningcss`) adalah alat build.
- Lisensi proyek ini belum dipilih. `package.json` menandainya `UNLICENSED` sebagai pilihan paling konservatif sampai pemilik memutuskan.

## 4. Nama "Project Realm"

"Project Realm" adalah **nama sementara** (kata "realm" sangat umum di dunia game). **Belum ada pemeriksaan merek dagang atau nama domain.** Sebelum nama dipublikasikan atau dipakai pada domain, akun media sosial, dan toko aplikasi, lakukan pencarian merek dagang dan ketersediaan nama. Nama hanya hidup di satu tempat (`GAME_TITLE` di `packages/shared/src/constants.ts`) sehingga penggantiannya murah.

## 5. Daftar periksa untuk setiap perubahan (isi PR)

- [ ] Semua aset baru dibuat sendiri atau berlisensi jelas, dan sudah tercatat di manifes.
- [ ] Tidak ada nama, teks, data, atau tata letak yang berasal dari game lain.
- [ ] Dependensi baru berlisensi permisif, atau jelas hanya dipakai saat build.
- [ ] Potongan kode dari luar tercatat asal dan lisensinya.
- [ ] Tidak ada _prompt_ AI yang menyebut game atau gaya tertentu.

## 6. Dokumen dunia

Saat Fase 4-5 membuat dunia dan makhluknya, tulis desain dunia orisinal (lore, daerah, faksi, bestiary, gaya visual) di `docs/WORLD.md` **sebelum** membuat kontennya. Dokumen itu adalah bukti bahwa isi game berasal dari desain proyek ini sendiri.
