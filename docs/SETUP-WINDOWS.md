# Panduan Windows

Panduan ini untuk Windows 10 atau 11. Semua perintah berjalan di **Command Prompt (cmd)** maupun **PowerShell**. Bila ada perbedaan, keduanya ditulis terpisah.

> Catatan kejujuran: proyek ini diverifikasi di Linux dan lewat matriks CI yang menyertakan `windows-latest` (belum pernah dijalankan di GitHub saat dokumen ini ditulis). Jika Anda menemukan masalah khusus Windows yang tidak tercantum di bagian 8, itu temuan penting; laporkan.

## 1. Pasang alat

Buka **terminal baru** (cmd atau PowerShell) dan jalankan:

```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Opsional, editor kode:

```
winget install Microsoft.VisualStudioCode
```

**Tutup lalu buka lagi terminalnya** setelah pemasangan (agar `PATH` ter-update), kemudian periksa:

```
node -v
npm -v
git --version
```

`node -v` harus menampilkan **v22.13.0 atau lebih baru** (LTS saat ini v24). Jika `winget` tidak dikenali, perbarui "App Installer" dari Microsoft Store, atau pasang Node.js dan Git lewat installer resmi di situs masing-masing.

## 2. Ambil kode dan jalankan

Pilih folder **di luar OneDrive**, misalnya `C:\dev` (lihat bagian 8: OneDrive dan antivirus memperlambat `node_modules`).

```
mkdir C:\dev
cd C:\dev
git clone https://github.com/kangrebahancuy-cmyk/arena.git
cd arena
npm install
npm run dev
```

Lalu buka **http://localhost:5173** di browser. Hentikan dengan **Ctrl+C**.

`npm install` pertama membutuhkan koneksi internet dan beberapa menit. Setelah itu tidak perlu diulang kecuali dependensi berubah.

## 3. Yang seharusnya Anda lihat

Di terminal, dua proses berjalan berdampingan dengan awalan `[server]` dan `[client]`:

```
[server] [12:34:56.789] INFO: Server listening at http://127.0.0.1:3001
[client]   VITE v8.x.x  ready in ... ms
[client]   ➜  Local:   http://localhost:5173/
```

Di browser muncul kartu "Project Realm" dengan bagian **System check**:

- Client: `v0.1.0 · development build`
- Server: lencana hijau **Online** dengan versi, uptime, dan latensi **yang dilaporkan server sungguhan**
- Protocol: `v1 · compatible`

Ini hanya layar fondasi (Fase 1). Dunia game belum ada, dan itu memang dijanjikan di [ROADMAP.md](ROADMAP.md).

## 4. Menguji server tanpa browser

```
curl.exe http://127.0.0.1:3001/api/health
```

Di PowerShell, `curl` (tanpa `.exe`) adalah alias untuk `Invoke-WebRequest` dengan keluaran berbeda. Pakai `curl.exe`, atau:

```
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

Jawaban yang benar berupa JSON dengan `"status":"ok"` dan `"service":"project-realm-server"`.

## 5. Perintah sehari-hari

| Perintah                  | Fungsi                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`             | Server (`:3001`) dan klien (`:5173`) sekaligus, dengan muat ulang otomatis  |
| `npm run dev:server`      | Hanya server                                                                |
| `npm run dev:client`      | Hanya klien                                                                 |
| `npm run check`           | Typecheck, lint, cek format, dan semua tes (jalankan sebelum commit)        |
| `npm test`                | Semua tes                                                                   |
| `npm run lint:fix`        | Memperbaiki masalah lint yang bisa diperbaiki otomatis                      |
| `npm run format`          | Merapikan format semua berkas                                               |
| `npm run build`           | Build produksi: server ke `apps/server/dist`, klien ke `apps/client/dist`   |
| `npm start`               | Menjalankan server hasil build (hanya API, `:3001`)                         |
| `npm run preview`         | Menyajikan klien hasil build di `:4173`, dengan `/api` diteruskan ke server |
| `npm run clean`           | Menghapus hasil build                                                       |
| `npm run clean -- --deps` | Menghapus juga semua `node_modules` (lalu jalankan `npm install` lagi)      |

**Mencoba versi produksi lokal:** jalankan `npm run build`, lalu di satu terminal `npm start`, dan di terminal lain `npm run preview`, kemudian buka http://localhost:4173.

## 6. Mengubah pengaturan

Pengaturan tetap disimpan di berkas `.env` (berkas ini diabaikan git, jangan di-commit):

```
copy apps\server\.env.example apps\server\.env
```

Di PowerShell: `Copy-Item apps\server\.env.example apps\server\.env`. Template klien (`apps\client\.env.example`) hanya perlu disalin bila Anda ingin mengubah ambang log di console browser (`VITE_LOG_LEVEL`) atau nama host yang boleh dijawab dev server (`DEV_ALLOWED_HOSTS`). Lalu edit `apps\server\.env` (misalnya `PORT=3002`). Daftar variabel ada di [ARCHITECTURE.md bagian 10](ARCHITECTURE.md#10-sistem-konfigurasi-dan-variabel-lingkungan). **Jika Anda mengubah `PORT`, ubah juga `DEV_API_PROXY_TARGET` di `apps\client\.env`** (salin dari `apps\client\.env.example`) agar proxy klien mengarah ke port yang sama.

Untuk **sekali jalan saja**:

```
:: cmd (tanda kutip mencegah spasi ikut terbawa ke dalam nilai)
set "PORT=3002" && npm run dev:server
```

```
# PowerShell
$env:PORT = "3002"; npm run dev:server
```

Variabel yang diatur di terminal selalu menang atas isi `.env`.

Variabel `VITE_*` (mis. `VITE_LOG_LEVEL=debug`) **ikut terkirim ke browser setiap pemain** — jangan pernah menaruh rahasia di sana. Angka yang harus sama di klien dan server (`protocolVersion`, `simulation.hz`) tidak diatur lewat `.env`; keduanya berasal dari satu `GameConfig` di `packages/shared`.

## 7. Membuka dari ponsel (satu Wi-Fi)

1. Jalankan `npm run dev` di PC.
2. Cari alamat IP PC: `ipconfig`, lihat **IPv4 Address** pada adapter Wi-Fi, misalnya `192.168.1.20`.
3. Di browser ponsel buka `http://192.168.1.20:5173`.
4. Saat Windows menampilkan peringatan firewall untuk **Node.js JavaScript Runtime**, izinkan hanya untuk **Private networks**.

Hanya server Vite (`:5173`) yang perlu dijangkau ponsel. Server game tetap hanya mendengarkan `127.0.0.1`, karena Vite meneruskan `/api` kepadanya, jadi tidak ada konfigurasi tambahan.

Beberapa catatan:

- Membuka lewat **alamat IP** selalu diizinkan. Membuka lewat **nama host** (misalnya `http://nama-pc:5173`) ditolak Vite dengan 403 "Blocked request" sebagai perlindungan DNS-rebinding. Tambahkan nama itu ke `server.allowedHosts` di `apps/client/vite.config.ts` bila memang perlu.
- Server dev mendengarkan semua antarmuka agar ponsel bisa mengaksesnya. Di jaringan publik (kafe, kampus), **jangan** izinkan jaringan Public di firewall, atau batasi ke komputer ini saja: jalankan `npm run dev:server` di satu terminal dan `npm run dev -w apps/client -- --host 127.0.0.1` di terminal lain.

## 8. Pemecahan masalah

| Gejala                                                                                     | Penyebab                                                                   | Solusi                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PowerShell: `npm.ps1 cannot be loaded because running scripts is disabled on this system`  | Kebijakan eksekusi skrip PowerShell                                        | Jalankan sekali: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, atau gunakan Command Prompt                                                          |
| `'node' is not recognized` / `'npm' is not recognized`                                     | Terminal dibuka sebelum Node.js dipasang, atau `PATH` belum diperbarui     | Tutup semua terminal, buka yang baru. Jika masih gagal, pasang ulang: `winget install OpenJS.NodeJS.LTS`                                                                      |
| `npm error code EBADENGINE` (atau pesan "Unsupported engine")                              | Versi Node terlalu lama (butuh 22.13+)                                     | `winget upgrade OpenJS.NodeJS.LTS`, buka terminal baru, periksa `node -v`. Bila memakai `nvm-windows`, pilih versi 22.13+ atau 24                                             |
| `Not allowed to listen on 127.0.0.1:3001` (EACCES) saat server start                       | Windows (Hyper-V, WSL, Docker) mencadangkan rentang port tertentu          | Lihat rentang yang dicadangkan: `netsh interface ipv4 show excludedportrange protocol=tcp`. Pilih `PORT` di luar rentang itu (bagian 6) dan sesuaikan `DEV_API_PROXY_TARGET`  |
| `Port 3001 is already in use` (EADDRINUSE)                                                 | Ada proses lain (sering: terminal lama yang lupa dihentikan) memakai port  | cmd: `netstat -ano \| findstr :3001`, lalu `taskkill /PID <nomor> /F`. PowerShell: `Get-NetTCPConnection -LocalPort 3001`, lalu `Stop-Process -Id <nomor>`. Atau ganti `PORT` |
| Vite memakai `:5174` (bukan `:5173`)                                                       | `:5173` terpakai (mungkin klien yang lama masih berjalan)                  | Gunakan URL yang dicetak Vite, atau hentikan proses lama                                                                                                                      |
| Browser menampilkan **Offline** dan "The server is not responding properly (HTTP 500/502)" | Server game tidak berjalan, crash, atau `DEV_API_PROXY_TARGET` salah port  | Lihat baris `[server]` di terminal. Jalankan `npm run dev` (bukan hanya `dev:client`). Cocokkan `PORT` dengan `DEV_API_PROXY_TARGET`                                          |
| Browser menampilkan "Could not reach the server"                                           | Dev server klien sendiri tidak berjalan, atau jaringan terputus            | Pastikan `npm run dev` masih aktif dan alamat benar                                                                                                                           |
| "Update required" di browser                                                               | Halaman lama di tab dengan server yang lebih baru (versi protokol berbeda) | Klik **Reload page** (atau Ctrl+F5)                                                                                                                                           |
| Log browser terlalu ramai / terlalu sepi                                                   | `VITE_LOG_LEVEL` bawaan: `debug` di dev, `info` di build produksi          | Salin `apps\client\.env.example` menjadi `apps\client\.env` lalu setel `VITE_LOG_LEVEL` (mis. `warn` atau `silent`)                                                           |
| Jendela "Windows Security Alert" untuk Node.js                                             | Firewall bertanya karena dev server mendengarkan jaringan                  | Pilih **Private networks** saja. Jika Anda menolak, `localhost` tetap bekerja; hanya akses dari ponsel yang terblokir                                                         |
| `npm install` sangat lambat, atau galat `EPERM` / "operation not permitted"                | Antivirus atau OneDrive mengunci ribuan berkas kecil di `node_modules`     | Klon ke folder di luar OneDrive (mis. `C:\dev`). Coba lagi. Pertimbangkan mengecualikan folder proyek dari pemindaian real-time antivirus                                     |
| Galat "filename too long" / "path too long" saat clone                                     | Batas panjang path Windows                                                 | `git config --global core.longpaths true`, lalu klon lagi (dan pakai path pendek seperti `C:\dev\arena`)                                                                      |
| `npm run format:check` mengeluh soal akhir baris (CRLF)                                    | Berkas tersimpan dengan CRLF oleh editor                                   | `npm run format` merapikannya. Repo sudah memaksa LF lewat `.gitattributes` dan `.editorconfig`; pastikan editor memakai LF                                                   |
| Perilaku aneh setelah berpindah antara Windows dan WSL                                     | `node_modules` berisi binary native untuk OS yang berbeda                  | `npm run clean -- --deps`, lalu `npm install` di lingkungan yang ingin dipakai                                                                                                |
| Ingin mengulang dari awal                                                                  | -                                                                          | `npm run clean -- --deps`, lalu `npm install`                                                                                                                                 |

## 9. Catatan WSL (opsional)

Proyek ini juga berjalan di WSL2 (Ubuntu), dan `http://localhost:5173` dari browser Windows biasanya tersambung otomatis. Dua aturan:

- Simpan proyek di sistem berkas Linux (misalnya `~/arena`), **bukan** di `/mnt/c/...`, supaya instal dan watcher berkas jauh lebih cepat.
- Jangan berbagi satu folder `node_modules` antara Windows dan WSL (lihat tabel di atas).

## 10. Memperbarui kode

```
git pull
npm install
```

Jalankan `npm install` lagi hanya jika `package.json` atau `package-lock.json` berubah. Tidak ada salahnya menjalankannya setelah `git pull`.
