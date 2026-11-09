# Event Atlas — Changelog

## 1.6.0 — 2026-11-10

- Simpan progres Website Map ke disk setiap 5 detik dan saat scan selesai. Pulihkan hasil setelah restart, lanjutkan URL tersisa, dan buka 20 hasil terbaru melalui riwayat lokal.
- Atur seluruh domain atau subfolder tertentu, pengecualian path, dan kedalaman pencarian. Pilih metode sitemap saja, sitemap + link internal, atau JavaScript. Concurrent pages mendukung 1–5.
- Ganti nama grafik menjadi Struktur URL dengan Path awal dan Level. Tambahkan warna biru, jingga, ungu, dan sian per cabang, sorotan path, zoom, geser, sesuaikan ke layar, pencarian node, dan breadcrumb.
- Buka kelompok cakupan berhasil, redirect, gagal, dilewati, dan belum diperiksa. Bandingkan hasil lewat riwayat atau JSON untuk melihat URL baru, tidak ditemukan lagi, perubahan status, serta tujuan redirect, lalu ekspor CSV perbandingan.
- Save Website Map progress to disk every 5 seconds and when a scan finishes. Restore after restart, resume unfinished work, and open the latest 20 scans from local history.
- Configure domain or subfolder scope, excluded paths and scan depth. Choose sitemap-only, sitemap + internal links, or JavaScript discovery with 1–5 concurrent pages.
- Rename the chart to URL Structure with Starting path and Level columns. Add blue, orange, purple and cyan branches, route highlights, zoom, pan, fit-to-view, node search and breadcrumbs.
- Open coverage groups and compare scans from history or JSON to find newly discovered or absent URLs, status changes and redirect-target changes, then export the comparison as CSV.

## 1.5.11 — 2026-11-09

- Tambahkan workspace Website Map dengan pencarian sitemap dan link internal, pilihan membaca JavaScript, batas URL, dan 1–4 halaman bersamaan.
- Tampilkan grafik path subfolder dari kiri ke kanan, jumlah URL, pilihan starting point, pembukaan cabang, serta tabel URL dan ringkasan path.
- Tambahkan filter subfolder, pencarian, kedalaman dan status, unduhan CSV semua atau terfilter, ekspor SVG, dan simpan/impor JSON.
- Siapkan audit event satu URL dari baris tabel. Hasil parsial tersedia setelah mapping dihentikan.
- Pulihkan struktur direktori proyek yang tercampur saat upload melalui website GitHub.
- Add Website Map with sitemap and internal-link discovery, JavaScript rendering, URL limits, and 1–4 concurrent pages.
- Show subfolder paths from left to right, URL counts, starting points, expandable branches, and URL and path-summary tables.
- Add subfolder, search, depth and status filters, full or filtered CSV downloads, SVG export, and JSON save/import.
- Set up a single-URL event audit from a table row and keep partial results when mapping stops.
- Restore project directories flattened during the GitHub website upload.

## 1.5.10 — 2026-11-06

- Tambahkan opsi Firebase DebugView untuk package yang dipilih dan opsi menyimpan log diagnostik FA, FA-SVC, Google Tag Manager, dan MoEngage dari proses aplikasi. Pengaturan sementara dipulihkan setelah sesi.
- Simpan parameter Android yang lebih panjang, baca Bundle Firebase bersarang, dan tampilkan seluruh parameter serta pesan mentah yang tersimpan di rincian dan ekspor JSON.
- Add optional Firebase DebugView for the selected package and diagnostic capture for FA, FA-SVC, Google Tag Manager, and MoEngage logs from the app process. Restore temporary settings after the session.
- Keep longer Android parameters, read nested Firebase bundles, and expose all saved parameters and raw messages in details and JSON export.

## 1.5.9 — 2026-11-06

- Tambahkan filter **Platform** untuk GA4 / Firebase dan MoEngage pada Activity Timeline Android live dan impor JSON.
- Tampilkan nama platform pilihan saat sesi belum memiliki event teramati yang cocok.
- Add a **Platform** filter for GA4 / Firebase and MoEngage to live and imported Android timelines.
- Show the selected platform name when the session has no matching observed events.

## 1.5.8 — 2026-11-06

- Audit Android membaca nama event dan parameter dari notifikasi MoEngage yang terlihat di Logcat.
- Activity Timeline menampilkan pratinjau parameter dan menghitung event analytics terpisah dari penanda.
- Android Audit reads event names and parameters from supported MoEngage Logcat notifications.
- Activity Timeline previews parameters and counts analytics events separately from markers.

## 1.5.7 — 2026-11-06

- Mode **Audit Android (ADB)** menampilkan event GA4/Firebase yang teramati di Logcat pada Activity Timeline.
- Tambahkan penanda layar dan tap, detail parameter, serta ekspor dan impor JSON sesi Android.
- **Android Audit (ADB)** shows GA4/Firebase events observed in Logcat in Activity Timeline.
- Add screen and tap markers, parameter details, and Android session JSON export and import.

## 1.5.6 — 2026-11-06

- Tambahkan paket Docker Compose lokal berbasis v1.5.5 dengan Node.js, Playwright, dan Chromium dalam image.
- Dashboard dan koneksi extension tersedia di `127.0.0.1:4318`. Laporan audit otomatis disimpan di volume Docker.
- Add local Docker Compose packaging based on v1.5.5 with Node.js, Playwright, and Chromium in the image.
- Keep dashboard and extension connections on `127.0.0.1:4318` and store automated audit reports in a Docker volume.

## 1.5.5 — 2026-11-06

- Panduan **Cara menggunakan** di Activity Timeline mencakup pemasangan extension, koneksi real-time, perekaman, dan impor JSON.
- Footer dashboard menampilkan kredit **Steven Andrian** dan **ChatGPT**.
- **How to use** in Activity Timeline covers extension setup, live pairing, recording, and JSON import.
- The dashboard footer credits **Steven Andrian** and **ChatGPT**.

## 1.5.4 — 2026-11-06

- Activity Timeline memiliki filter jenis aktivitas, kolom Platform, dan panel detail per baris.
- Detail event mencakup parameter, sumber bukti, Measurement ID, endpoint, dan status HTTP jika teramati. Parameter dataLayer bertingkat seperti `ecommerce.items` ikut ditangkap dalam batas ukuran rekaman.
- Impor JSON v1.5.3 menampilkan detail dari observasi yang cocok dalam laporan.
- Activity Timeline adds an activity type filter, a Platform column, and a details drawer.
- Event details include parameters, evidence source, Measurement ID, endpoint, and HTTP status when observed. Nested dataLayer parameters such as `ecommerce.items` are captured within recording limits.
- Imported v1.5.3 reports can display details from matching event observations.

## 1.5.3 — 2026-11-06

- **Activity Timeline** menampilkan klik, scroll, submit form, navigasi, dan event yang teramati secara real-time di dashboard lokal.
- **Jeda** dan **Lanjutkan** tersedia di mode real-time dan JSON. Aktivitas dalam laporan JSON dapat dilihat setelah impor.
- Panel Chrome memakai tampilan baru dan dashboard memiliki ikon tab.
- **Activity Timeline** shows clicks, scrolling, form submissions, navigation, and observed events live in the local dashboard.
- **Pause** and **Resume** work in both live and JSON modes. Imported JSON reports can show their activity timeline.
- The Chrome panel has a refreshed design, and the dashboard has a favicon.

## 1.5.2 — 2026-11-06

- Panel **Rekam Manual** di Chrome DevTools merekam event saat pengguna menjalankan aksi sendiri.
- Sesi JSON dapat diimpor ke Event Explorer dengan URL, konteks klik, sumber bukti, dan status HTTP bila tersedia.
- The **Manual Recording** panel in Chrome DevTools records events while the user performs actions.
- Import a session JSON into Event Explorer with URLs, click context, evidence source, and HTTP status when available.

## 1.5.1 — 2026-11-06

- Navigasi awal yang gagal dengan `ERR_HTTP2_PROTOCOL_ERROR` dicoba sekali lagi dengan HTTP/1.1. Rincian halaman mencatat setiap percobaan.
- Audit dengan semua pemuatan gagal menampilkan status gagal. Ringkasan uji membedakan kegagalan halaman dari percobaan klik.
- Fallback cache hanya meneruskan request jika persiapan respons belum selesai. Kegagalan setelah penyelesaian route tidak memicu panggilan kedua.
- Initial navigation retries once over HTTP/1.1 after an HTTP/2 protocol error. Page details list each attempt.
- Audits with no successful page load report failure. Test summaries distinguish page-load failures from click attempts.
- Cache fallback is limited to response preparation. A failed terminal route operation does not trigger a second operation.

## 1.5.0 — 2026-11-05

### Indonesia

- Filter pemicu untuk page load, klik, impression, link keluar, percobaan submit, serta inventaris login dan logout untuk uji manual.
- Rincian halaman memfilter event teramati, diuji tanpa event, dilewati, perlu uji manual, dan gagal.
- Halaman & cakupan dapat mengekspor semua baris atau hasil filter aktif ke CSV.
- Batas klik 6, 10, 12, 20, 50, atau hingga 200 elemen. Pilihan awal 12.
- Ekspres memeriksa hingga empat halaman bersamaan dengan jendela observasi 0,9 detik. Uji terkontrol membandingkannya dengan Cepat pada 12 halaman.

### English

- Trigger selection for page load, clicks, impressions, outbound links, submit attempts, and login and logout inventory for manual tests.
- Page details can filter observed events, tests without an observed event, skipped tests, manual tests, and failures.
- Pages & coverage can export all rows or the active filter to CSV.
- Click limits of 6, 10, 12, 20, 50, or up to 200 elements. The default is 12.
- Express checks up to four pages at a time with a 0.9-second observation window. A controlled test compares it with Fast across 12 pages.

## 1.4.0 — 2026-11-05

### Indonesia

- Ringkasan Event Explorer per platform, nama, dan kategori; drill-down observasi lengkap dan filter kategori halaman/handler klik/navigasi/lainnya.
- Pisahkan halaman asal, URL saat event, aksi uji, dan hubungan dengan klik. Pageview setelah navigasi ditampilkan pada konteks halaman tujuan; elemen sebelumnya bukan bukti tombol memiliki custom tracking.
- Bukti pemanggilan sinkron dalam handler klik diberi label tersendiri. Event asinkron, request, dan batch tetap diberi hubungan waktu, tanpa mengklaim penerimaan platform.
- Cache aset publik sesuai header HTTP, statistik bertahap, dan indeks event per halaman. Cache aktif secara bawaan; reload sebelum setiap klik tetap bawaan.
- Pilihan pemakaian ulang halaman eksperimental dengan pemeriksaan DOM/URL/cookie/storage/isian dan mode isolasi pada setiap aksi/event. Keadaan JavaScript tersembunyi tetap merupakan batasan.
- Checkpoint lokal setiap 15 detik dan saat audit berakhir; muat kembali setelah restart dan tombol Lanjutkan audit. Dukungan resume JSON lama pada tingkat halaman dengan mempertahankan versi bukti asal dan mengecualikan waktu jeda dari timer.
- ETA kasar hingga batas halaman, statistik pemuatan/cache/pemakaian ulang per sesi, dan pemisahan alasan elemen dilewati dari kegagalan.
- CSV menambahkan halaman asal/event, kategori, hubungan, dan isolasi. Semua observasi tetap tersedia; tampilan ringkasan tidak menghapus data.
- Antarmuka, panduan upgrade, dan riwayat perubahan Indonesia/Inggris; uji otomatis dan benchmark lokal dengan pemeriksaan kesetaraan event/lokasi.

### English

- Event Explorer summaries by platform, name, and category, with full-observation drill-down and page/handler/navigation/other filters.
- Separate origin page, observed event URL, test action, and click relationship. Destination pageviews show page context; previous test elements do not prove custom button tracking.
- Label synchronous calls inside click handlers separately. Asynchronous observations, network requests, and batches retain temporal attribution without claiming platform receipt.
- HTTP-aware public-asset caching, incremental statistics, and per-page event indexes. Caching is on by default; reload-before-click remains the default.
- Optional experimental page reuse compares DOM, URL, cookies, storage, and form values and records isolation per action/event. Hidden JavaScript state remains a limitation.
- Local checkpoints every 15 seconds and on completion, restart recovery, and explicit Resume audit. Older JSON can resume by page while preserving evidence provenance and excluding downtime from duration.
- Rough ETA up to the selected page limit, per-session load/cache/reuse metrics, and explicit skip-reason breakdowns.
- CSV adds origin/event URLs, category, relationship, and isolation. Summary views preserve all original observations.
- Indonesian/English interface, upgrade guide, release history, automated verification, and a controlled local event/location-parity benchmark.

## 1.3.0 — 2026-11-04

### Indonesia

- Ditambahkan pilihan pra-audit **Seluruh website** dan **Satu URL saja**.
- Mode satu URL melewati sitemap dan penemuan link, membatasi audit ke satu target, serta mempertahankan query/fragment URL input.
- Batas halaman otomatis menjadi 1; satu worker digunakan. Profil kecepatan menampilkan waktu observasi yang sesuai untuk satu halaman.
- Pengujian klik tetap berjalan; navigasi keluar halaman ditahan dan dicatat pada rincian elemen. Redirect awal pada origin yang sama tetap dicatat sebagai URL akhir.
- Cakupan tersimpan dalam JSON, muncul pada ringkasan cakupan, dipulihkan saat refresh, dan tersedia melalui CLI `--scope site|single`.
- Laporan versi sebelumnya tetap dapat diimpor; cakupan lama diasumsikan Seluruh website.

### English

- Added **Entire website** and **Single URL only** scope choices before an audit.
- Single-URL mode skips sitemaps and link discovery, limits the audit to one target, and preserves the input URL query/fragment.
- Page limit is fixed at 1 with one worker. Speed profiles show the relevant single-page observation windows.
- Eligible click tests still run; navigation away is held and recorded in element details. Initial same-origin redirects are recorded as the final URL.
- Scope is saved in JSON, shown in coverage, restored after refresh, and exposed through CLI `--scope site|single`.
- Earlier report versions remain importable and default to website scope.

## 1.2.0 — 2026-11-04

### Indonesia

- Pilihan platform pra-audit: **GA4, dataLayer, MoEngage, Braze, Mixpanel**; minimal satu platform wajib dipilih.
- Hook pemanggilan SDK dan parser request untuk format vendor yang dikenali, tanpa menginisialisasi atau memaksa flush SDK.
- Platform disimpan pada setiap observasi dan ekspor CSV/JSON. Filter platform hasil terpisah dari pilihan cakupan audit.
- Bukti SDK, request jaringan, dan dataLayer tetap terpisah. Batch jaringan ditandai berdasarkan waktu pengiriman, bukan dianggap bukti pemicu asli.
- Endpoint dikenal dengan payload tidak terbaca masuk catatan **Perlu diperiksa**, bukan dibuatkan nama event perkiraan.
- Workspace menjadi **Website Event Audit**. Domain awal kosong; tidak memuat laporan contoh otomatis atau menampilkan identitas perusahaan tertentu.
- Impor laporan v1.0.0/v1.1.0 tetap didukung dengan penentuan platform dari sumber bukti lama.
- Metrik Nama event kini menghitung kombinasi platform+nama unik dari semua jenis bukti. Satu nama pada SDK dan jaringan platform yang sama dihitung sekali.

### English

- Added pre-audit platform selection: **GA4, dataLayer, MoEngage, Braze, Mixpanel**; at least one is required.
- Added SDK-call hooks and parsers for recognized vendor request formats, without initializing or forcing SDK flushes.
- Added platform identity to observations and CSV/JSON exports, plus a separate result-platform filter.
- Kept SDK, network, and dataLayer evidence distinct. Network batches use send-time attribution, not proof of the original trigger.
- Known endpoints with unreadable payloads become review notes rather than guessed events.
- Renamed the workspace to **Website Event Audit**, left the domain blank, and removed automatic sample loading and company-specific branding.
- Preserved v1.0.0/v1.1.0 report import with platform inference from older evidence sources.
- Event names now count unique platform+name pairs across all evidence. SDK and network records with the same platform and name count once.

## 1.1.0 — 2026-11-04

### Indonesia

- Ditambahkan pilihan bahasa Indonesia dan Inggris, dengan preferensi disimpan di browser.
- Ditambahkan timer sejak audit dimulai, durasi total setelah selesai/dihentikan, serta versi mesin pada laporan JSON.
- Kartu **Perlu diperiksa** sekarang dapat diklik untuk membuka daftar halaman bermasalah. Tersedia filter halaman gagal, error JavaScript, klik gagal, elemen dilewati, pencarian URL, dan rincian setiap halaman/elemen.
- Ditambahkan mode **Seimbang** (2 halaman paralel, observasi 1,8 detik per tahap), **Cepat** (3 halaman paralel, 0,9 detik), dan **Mendalam** (1 halaman, 3,5 detik). Mode Cepat dapat melewatkan event yang muncul terlambat; tidak ada jaminan faktor percepatan tertentu.
- Ditambahkan nomor versi aplikasi, versi mesin yang terhubung, dan riwayat perubahan di dalam aplikasi.
- Pembaruan laporan bertahap kini aman untuk event dari beberapa halaman yang dipindai bersamaan. Halaman hasil juga diberi paginasi.
- Laporan v1.0.0 tetap dapat diimpor. Timer menggunakan waktu mulai/selesai lama tanpa mengubah asal versi laporan.
- Mesin audit yang sedang berjalan tidak dihentikan atau diubah. Pembaruan dipasang setelah audit selesai dan laporan diekspor.

### English

- Added an Indonesian/English interface with browser-persisted language preference.
- Added a live timer, final duration for completed/stopped runs, and audit engine version in JSON reports.
- Made **Needs review** clickable, with failed-page, JavaScript-error, failed-click, and skipped-element filters, URL search, and page/element details.
- Added **Balanced** (2 concurrent pages, 1.8-second stage window), **Fast** (3 pages, 0.9 seconds), and **Thorough** (1 page, 3.5 seconds). Fast mode can miss delayed events; no fixed speedup is guaranteed.
- Added interface/connected-engine versions and in-app release history.
- Made incremental report updates safe for interleaved parallel observations and paginated page results.
- Preserved v1.0.0 report import and duration derived from its original timestamps.
- Running audits are not stopped or reconfigured. Upgrade after completion and report export.

## 1.0.0 — 2026-11-04

- Initial development release / Rilis development awal.
- Sitemap and same-origin link crawling; page-load, scroll, and eligible click observations.
- GA4 request, gtag, and dataLayer evidence; page and element mapping; CSV/JSON export.
- Local audit application and hosted report dashboard; a clearly labeled 6-page Sequis validation sample.
