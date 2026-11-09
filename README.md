# Event Atlas

Versi **1.5.10** · Development. Pilih Indonesia atau Inggris di kanan atas. Riwayat rilis tersedia di [CHANGELOG.md](CHANGELOG.md).

Dibuat oleh **Steven Andrian** bersama **ChatGPT**.

Tool audit event website lintas platform untuk menemukan event dan lokasi halaman/link/tombolnya. Masukkan domain yang ingin diperiksa; tidak ada domain bawaan atau laporan contoh yang dimuat otomatis.

## Audit Android dengan APK klien

1. Pasang [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools) atau Android Studio di laptop. Jalankan Event Atlas dari folder rilis dengan `npm start`.
2. Nyalakan emulator Android atau sambungkan HP tes dengan **USB debugging** dan izinkan koneksi saat diminta. Jalankan `adb devices` untuk melihat perangkat yang siap. Pasang APK dengan `adb install "path/ke/client.apk"` pada satu perangkat yang terhubung, lalu buka aplikasinya. Jika ada beberapa perangkat, pilih target dengan `adb -s SERIAL install "path/ke/client.apk"`. APK dipasang apa adanya.
3. Buka dashboard **Activity Timeline → Sumber → Audit Android (ADB)**. Klik **Cari perangkat**, lalu pilih perangkat dan package aplikasi. Jika perlu, centang opsi debug atau diagnostik sebelum klik **Mulai rekam**.
4. Lakukan aksi di HP. Event GA4/Firebase dan MoEngage yang teramati akan muncul otomatis dengan pratinjau parameter. Klik **Lihat rincian** untuk membuka semua parameter yang tersimpan. **Penanda layar** dan **Penanda tap** bersifat opsional dan membantu memberi konteks.
5. Klik **Berhenti → Unduh JSON** untuk menyimpan sesi. Gunakan **Impor hasil** di dashboard untuk membuka laporan Android lagi.

- **Aktifkan Firebase DebugView** mengatur mode debug bagi package pilihan di perangkat tes. Untuk memeriksa event di Firebase, buka **DebugView** pada proyek aplikasi yang bisa kamu akses. Mode ini dapat mempercepat pengiriman event uji ke proyek itu. [Firebase DebugView](https://firebase.google.com/docs/analytics/debugview#android)
- **Simpan log diagnostik Android** menyimpan pesan mentah dari tag `FA`, `FA-SVC`, `GoogleTagManager`, dan `MoEngage` yang ditulis oleh proses aplikasi pilihan. Buka **Filter aktivitas → Diagnostik** untuk melihat pesan tambahan, termasuk potongan yang ditulis terpisah. Rincian event juga menampilkan pesan mentahnya. Pesan mentah dan JSON bisa berisi data sensitif. [Diagnostik Tag Manager Android](https://developers.google.com/tag-platform/tag-manager/android/v5)

Gunakan **Platform** untuk menyaring **GA4 / Firebase**, **MoEngage**, atau diagnostik **Google Tag Manager**, baik saat merekam maupun setelah impor JSON. Perekam membaca event Firebase `Logging event (FE)` dan notifikasi MoEngage `Core_ActionNotifier onEventTracked()`. Konteks tap memakai kedekatan waktu. [Panduan log Firebase](https://firebase.google.com/docs/analytics/android/events)

Jika parameter lama terpotong oleh Event Atlas, rekam ulang dengan versi ini. Jika Android sudah memotong pesan per entri, gunakan build QA yang menulis payload per bagian atau ekspor debug dari aplikasi. Event Atlas menyimpan bagian yang terbaca. Satu sesi dapat menyimpan hingga 5.000 baris atau 24 MiB data. [Batas entri log Android](https://android.googlesource.com/platform/system/logging/+/refs/heads/master/liblog/include/log/log.h)

Event Atlas mengaktifkan `log.tag.FA` dan properti debug yang dipilih untuk sesi itu, lalu memulihkannya selama perangkat masih bisa diakses. Jika perangkat putus saat pemulihan, nyalakan ulang perangkat tes untuk mereset properti sementara. Jika proses app berganti, mulai sesi baru. Mode perekaman Android berjalan lewat `npm start` pada host yang terhubung ke perangkat. Paket Docker dapat membuka laporan Android melalui impor JSON.

For Android Audit, install Android SDK Platform-Tools, open the client APK on an authorized test phone or emulator, and run Event Atlas on the host with `npm start`. In **Activity Timeline**, select **Android Audit (ADB)** and pick the device and app. Optionally enable **Firebase DebugView** or **Keep Android diagnostic logs** before recording. Open **View details** to see all saved parameters and any raw message, or choose **Activity filter → Diagnostic** to see additional log entries. **Download JSON** to save or reimport the session. If the original entry was cut off by Android, use a QA build that logs the payload in parts or exports it separately.

## Jalankan lewat Docker Desktop

1. Pasang dan buka Docker Desktop untuk [Mac](https://docs.docker.com/desktop/setup/install/mac-install/) atau [Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Tunggu sampai Docker berjalan.
2. Ekstrak ZIP dan buka Terminal atau PowerShell di folder yang berisi `compose.yaml`. Jika Event Atlas lama memakai port 4318, simpan atau ekspor sesi yang aktif sebelum menghentikan proses lama.
3. Jalankan:

   ```sh
   docker compose up -d --build --wait
   ```

   Build pertama mengunduh Node.js, Playwright, dan Chromium. Dependensi tersebut dipasang di image Docker.
4. Buka [dashboard lokal](http://127.0.0.1:4318/). Untuk rekam manual, buka **Activity Timeline** dan salin kode koneksi ke extension Event Atlas di Chrome pada komputer yang sama. Extension tetap dipasang di Chrome dari folder `manual`.
5. Saat selesai, jalankan `docker compose stop`. Untuk membuka lagi, jalankan `docker compose up -d --wait` dari folder yang sama.

Port dashboard diterbitkan pada `127.0.0.1:4318`. Volume Docker menyimpan laporan audit otomatis. Ekspor JSON untuk menyimpan sesi Activity Timeline sebelum menghentikan container. Jika dashboard gagal terbuka, lihat `docker compose ps` dan `docker compose logs --tail=50`.

On Docker Desktop, run `docker compose up -d --build --wait` from the extracted release folder, then open the dashboard at `http://127.0.0.1:4318/`. The Chrome extension still runs in the host browser. Use `docker compose stop` when finished. Automated reports use a named volume, and manual sessions can be saved by exporting JSON.

Chromium berjalan sebagai pengguna non-root. Profil seccomp di folder `docker` memakai profil dasar Moby v0.2.3 dengan izin `clone`, `setns`, dan `unshare` untuk sandbox Chromium sesuai panduan Playwright. [Profil dasar Moby](https://github.com/moby/profiles/blob/seccomp/v0.2.3/seccomp/default.json) · [Panduan Playwright](https://playwright.dev/docs/docker#crawling-and-scraping)

## Rekam manual di Chrome

Di dashboard, buka **Activity Timeline → Cara menggunakan** untuk melihat langkah pemasangan, koneksi, dan penggunaan perekam.

1. Ekstrak ZIP rilis. Di Chrome, buka `chrome://extensions`, aktifkan **Developer mode**, klik **Load unpacked**, lalu pilih folder `manual`.
2. Buka situs di Chrome. Buka DevTools dengan **Option + Command + I** di Mac atau **Ctrl + Shift + I** di Windows. Pilih tab **Event Atlas**. Cari di menu **»** jika tab tersembunyi.
3. Untuk mode **Real-time ke dashboard**, jalankan `npm start` dari folder rilis dan buka **Activity Timeline** di dashboard lokal `http://127.0.0.1:4318/`. Salin kode koneksi ke panel extension, lalu klik **Mulai rekam**. Klik, scroll, submit, navigasi, dan event yang teramati masuk ke timeline saat sesi berjalan.
4. Pilih **Rekam ke JSON** jika ingin merekam tanpa dashboard aktif. **Jeda** dan **Lanjutkan** tersedia di kedua mode. Aksi saat jeda tidak ikut direkam.
5. Setelah **Berhenti**, kamu bisa **Unduh JSON** dari kedua mode. Pilih **Impor hasil** pada dashboard untuk melihat detail di **Event Explorer → Observasi lengkap**, atau pilih sumber **Impor JSON** di **Activity Timeline**. Simpan file untuk arsip karena dashboard lokal menyimpan satu sesi real-time terbaru di memori.

Di **Activity Timeline**, gunakan **Filter aktivitas** untuk memilih satu jenis aksi atau event. Kolom **Platform** menampilkan platform yang teramati pada baris event. Klik **Lihat detail** untuk melihat parameter, sumber bukti, Measurement ID, endpoint, status HTTP, atau selector saat tersedia. Detail juga tersedia untuk impor v1.5.3 jika observasi terkait tersimpan di file. Untuk detail real-time, gunakan dashboard dan extension v1.5.4. Pratinjau parameter real-time dibatasi dan nilai untuk kunci kredensial umum disamarkan.

Perekam membaca entri yang masih ada di `dataLayer` dan request yang selesai saat sesi berlangsung. Request yang dikenali mencakup GA4, MoEngage, Braze, dan Mixpanel. Saat kamu klik, scroll, atau mengirim form, browser tetap menjalankan aksi dan request seperti biasa. Rekaman mengikuti URL yang terlihat di satu tab pada origin awal, termasuk perubahan URL SPA yang teramati. Keluar dari origin mengakhiri sesi. Klik yang langsung mengganti dokumen, entri antrean yang cepat dihapus, dan request yang belum selesai saat sesi berhenti dapat terlewat. Konteks klik didasarkan pada waktu, dan status HTTP menunjukkan respons yang teramati. Unduh JSON sebelum menutup DevTools. URL dan parameter event dapat memuat data situs.

Scroll yang berurutan pada target yang sama dapat digabung. Panel mencatat aksi submit yang terlihat browser dan mengabaikan isi input serta kata sandi. JSON tetap bisa berisi URL dan parameter event yang berasal dari situs. Rekaman page load dimulai setelah kamu klik **Mulai rekam** lalu muat ulang halaman.

The **Manual Recording** panel observes activity and analytics in one Chrome tab. Copy the pairing code from the local dashboard's **Activity Timeline** and select **Live to dashboard** for updates during the session. **Record to JSON** works independently. Both modes support **Pause**, **Resume**, and **Download JSON**. Import a saved file to review its timeline and event evidence. Out-of-origin navigation ends the session. Continuous scrolls may be grouped, and click associations use timing.

Use **Filter activity** and the **Platform** column to navigate the timeline. **View details** shows parameters and available evidence metadata. Imported v1.5.3 timelines can show details when the matching observation is in the file. Live details require the v1.5.4 dashboard and extension. Live previews are size-limited and mask values for common credential keys.

## Pemicu dan cakupan v1.5

Pilih pemicu sebelum memulai audit. Page load, klik, dan impression dipilih saat pertama dibuka. Impression menguji hingga enam elemen bertanda seperti `data-impression` atau `data-product-id` di bawah viewport, lalu menjalankan scroll umum. Event saat elemen masuk viewport dikaitkan berdasarkan waktu uji.

Link keluar dan percobaan submit dapat dipilih terpisah. Selama aksi, mesin menahan navigasi dan request serta memblokir WebSocket untuk sesi audit itu. Form diuji dengan nilai awal. Rincian membedakan klik tombol dari percobaan submit yang teramati. Submit berhasil serta login dan logout perlu pengujian manual.

Buka rincian halaman untuk memfilter hasil tiap pemicu. Di **Halaman & cakupan**, pilih **Unduh semua halaman** atau **Unduh hasil filter** untuk menyimpan URL, status HTTP, jumlah elemen, dan alasan pemeriksaan ke CSV. Batas klik tersedia pada 6, 10, 12, 20, 50, dan hingga 200, dengan pilihan awal 12.

**Ekspres** memakai hingga empat worker untuk audit seluruh website. Waktu observasinya 0,9 detik per tahap, sama seperti Cepat. Kecepatan aktual bergantung pada situs dan komputer. Audit satu URL memakai satu worker.

CLI menerima `--speed express` dan `--triggers page_load,click,impression,outbound,form_submit,authentication`. Pilih subset pemicu sesuai audit yang ingin dijalankan. Resume menggunakan pemicu dari laporan asal.

In English, **Triggers to test** lets you select page loads, clicks, impressions, outbound links, submit attempts, and manual authentication inventory. Impression testing combines up to six marked below-viewport elements with a general scroll. Outbound and submit probes hold requests during the action. Successful form delivery and authentication require manual testing. **Pages & coverage** exports all rows or the active filter to CSV. Express uses up to four workers with the same 0.9-second observation window as Fast.

## Optimasi dan hasil v1.4

- **Cache aset statis** aktif secara bawaan. Cache berada di memori setiap konteks halaman, maksimal 16 MB, dan hanya memakai respons publik GET script/CSS/font/gambar yang masih segar menurut `max-age`, Date, dan Age. Respons private/no-store/no-cache, autentikasi, Set-Cookie, dan variasi sensitif dilewati. Dokumen HTML, API, dan request analitik tidak disimpan. Cache tidak dibagikan antar konteks halaman.
- **Statistik bertahap** memperbarui halaman yang berubah dan indeks event per halaman; mesin tidak menghitung ulang seluruh riwayat aksi untuk setiap klik. Dashboard menerima delta halaman dan mempertahankan hasil worker lain.
- **Muat ulang setiap klik** tetap bawaan. Pilihan **Pemakaian ulang eksperimental** pada Optimasi audit dapat menghindari reload setelah tombol yang tidak mengubah DOM, URL, cookie, storage, atau isian. Keadaan JavaScript tersembunyi masih bisa berubah. Ini dapat mengubah hasil; pakai mode isolasi untuk validasi. Setiap aksi/event baru menyimpan mode isolasinya.
- **ETA** adalah perkiraan kasar dari durasi hingga 20 halaman terakhir, jumlah worker, dan sisa halaman sampai batas audit yang dipilih. Pola halaman dan penemuan URL baru dapat mengubah estimasi.
- **Performa & alasan elemen dilewati** memisahkan elemen tidak terlihat, batas klik, form/sensitif/link dikecualikan, nonaktif, dan gagal. Penghitung performa adalah untuk sesi saat ini; durasi total dan hasil dapat mencakup sesi sebelumnya.

Event Explorer kini dimulai dengan ringkasan per **platform + nama + kategori**. Buka satu grup untuk observasi lengkap, gunakan filter kategori/bukti/platform, atau cari URL dan elemen. Jumlah **lokasi uji** menunjukkan konteks pengujian, bukan jumlah tombol dengan tracking terkonfirmasi. CSV selalu memuat observasi yang sesuai filter, bukan baris ringkasan; JSON memuat seluruh laporan.

Pada observasi baru, `originPage` adalah halaman asal aksi, `eventPage` adalah URL dari payload atau frame saat event teramati. Kategori nama halaman yang dikenali (misalnya `gtm_pageview`) ditampilkan sebagai event halaman; nama custom yang tidak dikenali tidak dipaksakan menjadi event halaman. `relationship` membedakan tingkat halaman, setelah navigasi, pemanggilan sinkron di handler klik, hubungan waktu setelah klik, dan waktu pengiriman batch. Pemanggilan di handler klik adalah bukti konteks eksekusi, bukan bukti penerimaan platform. Request jaringan tetap hanya bukti request teramati.

Laporan lama ditampilkan dengan label bukti versi lama. Kategori/hubungan untuk tampilan dapat diturunkan dari nama dan URL lama, tetapi tidak menambahkan bukti handler baru atau mengubah observasi asli. Event halaman/navigasi menampilkan elemen sebelumnya hanya sebagai konteks.

## Autosave dan melanjutkan audit

Mesin lokal menyimpan checkpoint ke `reports/checkpoints/` setiap 15 detik dan saat audit berakhir. File pointer dan JSON ditulis secara atomik; halaman yang berubah ditulis per file. Setelah restart, checkpoint terbaru dimuat; pemulihan tidak otomatis menjalankan browser. Klik **Lanjutkan audit** untuk melanjutkan. Checkpoint terbaru dapat kehilangan progres sejak penyimpanan terakhir; halaman yang belum selesai diulang.

Untuk berpindah ke v1.5 tanpa menunggu antrean penuh:

1. Ekspor **JSON** dari audit lama sekarang sebagai cadangan. Gunakan **Hentikan audit**, tunggu sampai status berhenti, lalu ekspor JSON lagi agar progres terakhir ikut tersimpan.
2. Ekstrak v1.5 ke folder terpisah. Tutup mesin lama setelah audit berhenti, kemudian jalankan **Mulai-Event-Atlas.cmd** dari folder baru.
3. Pilih **Impor hasil** dan JSON tadi. Naikkan batas halaman jika sudah tercapai, lalu pilih **Lanjutkan audit**.

Halaman selesai dipertahankan; halaman terputus atau gagal diulang dan observasi parsialnya diganti, agar tidak menggandakan hasil. Resume mempertahankan domain, cakupan, platform, consent, dan batas klik asal. Mengubah pilihan platform di form tidak menambahkan platform baru ke halaman yang telah selesai. Untuk cakupan platform berbeda, jalankan audit baru.

Setiap observasi mempertahankan `provenanceVersion`. Laporan gabungan menggunakan versi mesin terbaru dan mencatat `resumedFrom`; `startedAt` mempertahankan waktu mulai awal, `sessionStartedAt` menandai sesi baru, dan `previousDurationMs` mengecualikan waktu jeda. Kecepatan, cache, dan isolasi dapat dipilih untuk sisa antrean. Hasil v1.3 yang hanya merekam dataLayer tetap hanya mencakup dataLayer pada halaman lamanya.

Jika autosave gagal, dashboard menampilkan alasannya; ekspor JSON secara manual. Checkpoint dan ekspor disimpan lokal, tidak diunggah ke Sites. Jangan hapus folder checkpoint sebelum mengekspor hasil yang dibutuhkan. Pilihan `EVENT_ATLAS_REPORT_DIR` dapat memisahkan direktori penyimpanan untuk pengujian.

Contoh CLI:

```sh
node cli.mjs --resume reports/latest/audit.json --pages 3000 --speed fast
node cli.mjs --url https://example.com --reset smart --speed fast
node cli.mjs --url https://example.com --no-cache
```

### Pengukuran kecepatan

Uji lokal terkontrol: satu halaman asal, 4 klik, satu worker, jendela observasi 500 ms, script publik diberi delay buatan 400 ms. Hasil: isolasi tanpa cache **10,804 detik**, isolasi dengan cache **8,767 detik**, pemakaian ulang + cache **7,066 detik**. Delapan observasi dengan nama, platform, kategori, hubungan, selector, dan lokasi yang sama ditemukan pada ketiga mode; request analitik dan mutasi uji tetap tertahan. Aset `no-store` tetap diminta ulang. Ini pengukuran satu skenario lokal, bukan estimasi atau jaminan percepatan website nyata. Jalankan `node tests/benchmark.mjs` untuk mengulang; hasil berada di `reports/benchmark-v1.4.0.json`.

### English release guide

v1.4 adds per-page HTTP-aware static caching, incremental statistics, rough ETA, skip breakdowns, grouped event exploration, origin/event page details, 15-second local checkpoints, and page-level resume. Isolated reloads remain the default; experimental page reuse can miss hidden JavaScript-state changes. All original observations remain available, and CSV exports follow active filters.

To upgrade an active v1.3 audit: export JSON, stop and wait, export the final partial JSON, then launch v1.4 from a separate folder after closing the old engine. Import that JSON, raise the page limit if necessary, and choose Resume audit. Completed pages keep their evidence and engine provenance; unfinished/failed pages repeat. Resume preserves platforms, scope, consent, and click limits. Run a new audit to change platform coverage. Total duration excludes time between sessions. Automatic recovery loads the most recent checkpoint but requires an explicit Resume click; progress since the last save may be lost. Export JSON manually if autosave reports an error.

The controlled local benchmark above found identical event/location evidence across the three configurations. Its artificial asset delay and 500 ms observation windows are test conditions, not a claim about production speed or completeness.

## Cakupan audit (v1.3)

- **Seluruh website**: perilaku crawl sebelumnya; mulai dari URL input, temukan sitemap dan link internal pada origin yang sama, hingga batas halaman yang dipilih.
- **Satu URL saja**: hanya satu target audit. Sitemap tidak diambil dan link tidak ditambahkan ke antrean. Batas halaman otomatis 1 dan mesin memakai satu worker. Pilihan kecepatan hanya mengatur waktu observasi, bukan menambah halaman paralel.
- Mode satu URL mempertahankan query dan fragment input, termasuk parameter tracking yang dapat memengaruhi perilaku event. Redirect awal pada origin yang sama tetap diikuti dan URL akhirnya dicatat. Robots.txt tetap diperiksa; ini bukan halaman tambahan yang diaudit.
- Tombol dan link yang memenuhi aturan pengujian tetap diklik. Navigasi ke halaman lain ditahan melalui default link, History API, popup, dan routing dokumen. Rincian elemen mencatat navigasi yang ditahan. Satu URL dapat dimuat ulang beberapa kali sebelum klik agar setiap pengujian dimulai dari keadaan halaman awal.
- Resource halaman (script, gambar, API, atau iframe) tetap dapat diminta saat rendering sesuai aturan jaringan mesin. Mode ini membatasi target halaman audit, bukan berarti hanya ada satu HTTP request. Menahan navigasi dapat mengubah perilaku aplikasi; event yang memerlukan halaman tujuan atau journey lanjut tidak diuji sampai selesai.
- `report.options.scope` menyimpan `site` atau `single`; laporan lama tanpa field tersebut dianggap memakai mode website.

Contoh satu halaman:

```sh
npm run audit -- --url "https://example.com/products/detail?plan=A" --scope single --platforms ga4,dataLayer,moengage,braze,mixpanel --elements 12
```

## Pilihan platform (v1.2)

Pilih satu atau beberapa platform sebelum menjalankan audit. Pilihan disimpan pada `report.options.platforms`; setiap observasi memiliki `platform` dan jenis `source`. Pilihan membatasi bukti yang dicatat, bukan menonaktifkan SDK situs.

| Platform | Pemanggilan browser | Payload jaringan yang dikenali |
| --- | --- | --- |
| GA4 | Perintah event gtag melalui antrean dataLayer | Payload collect GA4 v2 |
| dataLayer | Custom event pada antrean dataLayer | Tidak dianggap bukti pengiriman ke platform |
| MoEngage | `Moengage.trackEvent`, `track_event`, dan notifikasi `MOE_AUTOMATED_EVENTS` | JSON compact `e/a` serta batch `viewsInfo/ EVENT_ACTION / EVENT_ATTRS` pada host MoEngage |
| Braze | `braze.logCustomEvent`, `logPurchase`; alias `appboy` | Custom-event/purchase pada batch `/api/v3/data` |
| Mixpanel | `mixpanel.track`, termasuk named instance setelah `init` | `/track` pada host Mixpanel; JSON, form data, base64, query GET, dan gzip/deflate |

SDK dimuat dan dijalankan oleh situs. Mesin tidak memasang, menginisialisasi, atau memaksa flush SDK, tidak meminta push permission, dan tidak mengidentifikasi pengguna. Method wrapper menjaga `this`, return value, dan exception SDK. Pemanggilan SDK yang diamati bisa ditolak atau diantrekan SDK; bukan bukti platform menerima event.

SDK di modul privat dapat tidak terlihat oleh hook global. Jaringan masih dapat teramati bila endpoint/payload dikenali. Proxy custom, payload terenkripsi/tidak dikenal, batch yang belum terkirim dalam jendela uji, dan event server-side dapat terlewat. Request pada endpoint yang dikenal tetapi payloadnya tidak terbaca dicatat sebagai catatan halaman, bukan event yang ditebak.

Request event yang dikenali ditahan, termasuk jika platformnya tidak dipilih untuk pencatatan. Resource/telemetry lain tidak dijamin seluruhnya terblokir. Batch diberi `attribution: batch-time`, karena waktu pengiriman bisa berbeda dari pemicu asli; jangan menganggap tombol yang sedang diuji sebagai pemicu pasti semua event dalam batch.

Filter hasil berdasarkan platform terpisah dari pilihan pra-audit. CSV/JSON menyertakan platform, sumber, metode SDK bila ada, dan atribusi. Metrik **Nama event** menghitung kombinasi platform+nama unik dari semua bukti, sehingga SDK dan request dengan nama yang sama pada platform sama dihitung sekali. dataLayer tidak otomatis digabung sebagai event GA4 atau platform lain.

## Mulai

Di Windows, ekstrak ZIP lalu klik dua kali **Mulai-Event-Atlas.cmd** dan buka http://127.0.0.1:4318/. Launcher dapat memakai runtime Codex yang sudah ada di komputer ini; jika tidak tersedia, diperlukan Node.js 20+. Biarkan jendela launcher terbuka selama audit.

Untuk setup manual atau platform lain, butuh Node.js 20+ dan koneksi internet. Di folder ini jalankan:

```sh
npm install
npx playwright install chromium
npm start
```

Buka http://127.0.0.1:4318/. Jika Chrome sudah terpasang, mesin dapat memakainya ketika Chromium belum tersedia. Untuk port lain, atur environment variable PORT sebelum menjalankan server.

Pilih batas halaman dan klik per halaman sesuai ukuran website, lalu periksa sisa URL setelah scan. Audit dengan banyak interaksi bisa berjalan berjam-jam. Tombol Hentikan menyimpan hasil parsial setelah operasi browser saat ini selesai; bukan berhenti seketika.

### Kecepatan, timer, dan pemeriksaan

- **Seimbang**: 2 halaman bersamaan; waktu observasi 1,8 detik per tahap. Ini pilihan awal untuk audit baru.
- **Cepat**: 3 halaman bersamaan; 0,9 detik per tahap. Event yang terlambat bisa terlewat dan beban CPU/jaringan meningkat.
- **Mendalam**: 1 halaman; 3,5 detik per tahap. Tetap tidak menjamin semua event terlambat ditemukan.
- Waktu tunggu berlaku setelah buka halaman, scroll, dan klik. Secara bawaan setiap klik didahului pemuatan ulang. Opsi pemakaian ulang eksperimental dijelaskan di atas; mengurangi jumlah klik juga mengurangi cakupan interaksi.
- Timer dimulai sebelum persiapan browser/penemuan sitemap, diperbarui setiap detik, dan berhenti saat mesin menyelesaikan audit. JSON menyimpan `appVersion`, `durationMs`, `startedAt`, dan `finishedAt`. Refresh tidak memulai ulang timer.
- Klik **Perlu diperiksa** untuk memfilter halaman dengan kegagalan navigasi, halaman dilewati, error JavaScript, atau klik gagal. Klik **Lihat rincian** untuk pesan error, consent, selector, dan alasan setiap elemen dilewati. Elemen yang sengaja dilewati bukan bukti tracking rusak; gunakan filter **Elemen dilewati** untuk menilai cakupan.
- Riwayat perubahan dapat dibuka di sidebar. Versi laporan tetap menunjukkan versi mesin yang menghasilkan laporan tersebut.

### Memperbarui instalasi

Jangan mengganti instalasi saat audit masih berjalan. Ekspor JSON dan gunakan alur upgrade/resume di atas, atau tunggu audit selesai. Browser Chrome yang menampilkan dashboard bukan mesin crawl: membuka tab Chrome lain atau mengganti bahasa tidak mempercepat audit yang sedang berjalan.

## Hasil

- `reports/latest/audit.json`: seluruh observasi, halaman, elemen, tindakan, error, sitemap, URL ditemukan, batas audit.
- `reports/latest/events.csv`: nama event, sumber, halaman, pemicu, teks elemen, selector, region, measurement ID, parameter, jumlah, dan metode atribusi.
- Dashboard dapat memfilter event, melihat detail parameter, menyalin selector, melihat cakupan, dan mengimpor/mengekspor JSON/CSV.
- CSV dari dashboard mengikuti filter aktif. JSON selalu berisi seluruh laporan.

## Jalankan dari terminal

```sh
npm run audit -- --url https://example.com --platforms ga4,dataLayer,moengage,braze,mixpanel --pages 100 --elements 12 --speed balanced --out reports/website
```

`--elements 0` untuk audit page load + scroll saja. `--consent accept` mencoba tombol dengan nama persis “accept all”, “allow all”, “terima semua”, “setujui semua”, atau “saya setuju”. Default membiarkan consent seperti situs. Mesin tidak memalsukan persetujuan pada dataLayer.

Gunakan `--workers 1|2|3` dan `--wait 500..10000` untuk mengganti jumlah halaman paralel dan waktu observasi (ms) secara eksplisit. Pengaturan ini berlaku untuk audit baru.

## Arti bukti

- **Request GA4**: payload `v=2`, event name `en`, dan measurement ID `tid=G-...` terdeteksi. Request tersebut ditahan dengan respons lokal HTTP 204. Ini percobaan pengiriman, bukan konfirmasi penerimaan atau pemrosesan di properti GA4.
- **gtag**: perintah event teramati pada antrean gtag. Bisa tidak menghasilkan request karena consent atau konfigurasi.
- **dataLayer**: custom event di antrean. Bisa untuk layanan lain, belum tentu GA4. Jangan menghitung semua dataLayer event sebagai event GA4 terkonfirmasi.
- Pemanggilan SDK/gtag, dataLayer, dan request yang terkait tetap dipisahkan menurut sumber. Ringkasan **Nama event** menghitung platform+nama unik dari semua bukti; satu nama pada SDK dan jaringan platform yang sama dihitung sekali.
- Lokasi klik adalah hubungan waktu saat satu elemen diuji. Event timer/asinkron dapat ikut tertangkap; validasikan lewat parameter. Tidak ada jaminan sebab-akibat.

## Cakupan dan batas

Sitemap (termasuk sitemap index sampai 50 file) dan link internal ditelusuri pada origin yang sama persis. Robots.txt untuk user-agent `*` dibaca; aturan khusus user-agent dan crawl-delay belum diproses. URL tracking dinormalisasi; query fungsional dipertahankan. Tidak ada login atau browser profile pribadi.

Audit mengamati page load, scroll, dan klik elemen yang terlihat sampai batas yang dipilih. Halaman dimuat ulang sebelum setiap klik untuk mengurangi pengaruh interaksi sebelumnya. Tidak ada input form. Elemen form/submit, tombol kontak/transaksi/destruktif, link luar origin, dan unduhan dilewati. Label sensitif memakai heuristik; evaluasi kebutuhan dan jalankan di staging bila perlu. Request event yang dikenali diberi respons lokal; request non-GET/HEAD/OPTIONS lainnya diblokir, sehingga alur yang memerlukan POST tidak diuji penuh. Navigasi lintas origin diblokir.

Halaman tanpa link/sitemap, login, iframe lintas origin, menu tersembunyi, video, journey bertahap, server-side events, dan event turunan dalam properti GA4 dapat tidak tercakup. Tidak adanya observasi tidak membuktikan event tidak ada. Custom proxy yang tidak memakai payload GA4 standar dapat lolos dari pendeteksian. Sebagian resource GET pihak ketiga tetap dapat mengirim telemetry; jangan menganggap seluruh traffic analytics terblokir.

Status `completed` berarti antrean URL yang diketahui telah habis, `limited` berarti batas halaman tercapai, dan `stopped` berarti dihentikan. Periksa juga halaman gagal, elemen dilewati, dan error penemuan sitemap. Waktu laporan tersimpan dalam UTC ISO 8601; dashboard menampilkan waktu lokal browser.

Dashboard online bersifat pembaca laporan. Browser audit harus berjalan lokal; dashboard tidak mengklaim bisa memindai situs lintas domain dari JavaScript biasa.

## Pengujian

```sh
npm test
```

Tes integrasi memakai situs fixture lokal, termasuk event page load/klik, GA4 batch POST, pergantian push dataLayer oleh GTM, error halaman, dan request yang tidak boleh diteruskan.

Referensi resmi:

- GA4: https://developers.google.com/analytics/devguides/collection/ga4/events
- MoEngage: https://www.moengage.com/docs/developer-guide/web-sdk/data-tracking/web-sdk-events-tracking
- Braze: https://www.braze.com/docs/developer_guide/analytics/logging_events?tab=web
- Mixpanel: https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript dan https://docs.mixpanel.com/reference/track-event
- Playwright: https://playwright.dev/docs/network

Parser MoEngage dan Braze ditinjau terhadap source distribusi vendor @moengage/web-sdk 2.81.1 (loader SDK 2.81.01) dan @braze/web-sdk 7.1.0. Pengujian memakai fixture lokal, bukan klaim audit langsung pada semua variasi integrasi SDK.
