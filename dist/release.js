export const VERSION = '1.6.0';
export const RELEASE_DATE = '2026-11-10';
export const SPEED_PROFILES = {
  balanced: {concurrency:2,waitMs:1800},
  fast: {concurrency:3,waitMs:900},
  express: {concurrency:4,waitMs:900},
  thorough: {concurrency:1,waitMs:3500}
};
export const CHANGELOG = [
 {version:VERSION,date:RELEASE_DATE,changes:{
  id:['Website Map menyimpan progres otomatis, memulihkan scan terputus, dan menyediakan riwayat hasil.','Atur subfolder, pengecualian, kedalaman pencarian, metode sitemap atau link, dan hingga 5 halaman bersamaan.','Gunakan Struktur URL, Path awal, dan Level dengan warna cabang kontras, zoom, geser, pencarian path, serta breadcrumb.','Buka rincian cakupan dan bandingkan dua hasil scan melalui riwayat atau JSON.'],
  en:['Website Map saves progress automatically, restores interrupted scans, and keeps scan history.','Configure subfolders, exclusions, scan depth, sitemap or link discovery, and up to 5 concurrent pages.','Explore URL Structure with Starting path and Level labels, contrasting branches, zoom, pan, path search, and breadcrumbs.','Inspect coverage groups and compare two scans from history or JSON.']
 }},
 {version:'1.5.11',date:'2026-11-09',changes:{
  id:['Tambahkan workspace Website Map untuk menemukan URL melalui sitemap dan link internal.','Jelajahi path subfolder lewat grafik interaktif, starting point, jumlah URL, dan tabel yang mengikuti pilihan.','Filter hasil, unduh CSV atau grafik SVG, simpan dan impor JSON, serta siapkan audit event satu URL.'],
  en:['Add the Website Map workspace to discover URLs through sitemaps and internal links.','Explore subfolder paths with an interactive graph, starting points, URL counts, and a linked table.','Filter results, download CSV or SVG, save and import JSON, and set up a single-URL event audit.']
 }},
 {version:'1.5.10',date:'2026-11-06',changes:{
  id:['Tambahkan opsi Firebase DebugView dan log diagnostik Android untuk FA, FA-SVC, Google Tag Manager, dan MoEngage.','Simpan nilai parameter Android yang lebih panjang, baca Bundle Firebase bersarang, dan tampilkan semua data yang tersimpan di rincian dan JSON.'],
  en:['Add optional Firebase DebugView and Android diagnostic logs for FA, FA-SVC, Google Tag Manager, and MoEngage.','Keep longer Android parameter values, read nested Firebase bundles, and show all saved data in details and JSON.']
 }},
 {version:'1.5.9',date:'2026-11-06',changes:{
  id:['Tambahkan filter GA4 / Firebase dan MoEngage untuk sesi Android live serta laporan impor.','Tampilkan pesan saat platform yang dipilih belum memiliki event teramati.'],
  en:['Add GA4 / Firebase and MoEngage filters to live Android sessions and imported reports.','Show a message when the selected platform has no observed events.']
 }},
 {version:'1.5.8',date:'2026-11-06',changes:{
  id:['Baca nama event dan parameter dari log MoEngage Android yang didukung.','Pisahkan hitungan event dari penanda dan tampilkan pratinjau parameter di Activity Timeline.'],
  en:['Read event names and parameters from supported MoEngage Android logs.','Count events separately from markers and show a parameter preview in Activity Timeline.']
 }},
 {version:'1.5.7',date:'2026-11-06',changes:{
  id:['Tambahkan Audit Android lokal melalui ADB dan Logcat untuk GA4/Firebase.','Tandai layar atau tap, lihat event teramati di Activity Timeline, lalu ekspor atau impor sesi Android.'],
  en:['Add local Android Audit for GA4/Firebase through ADB and Logcat.','Mark screens or taps, view observed events in Activity Timeline, and export or import Android sessions.']
 }},
 {version:'1.5.6',date:'2026-11-06',changes:{
  id:['Tambahkan paket Docker Compose untuk dashboard lokal dan mesin audit Chromium.','Gunakan alamat loopback yang sama untuk Activity Timeline dan simpan laporan audit otomatis di volume Docker.'],
  en:['Package the local dashboard and Chromium audit engine for Docker Compose.','Keep the same loopback address for Activity Timeline and store automated audit reports in a Docker volume.']
 }},
 {version:'1.5.5',date:'2026-11-06',changes:{
  id:['Tambahkan panduan pemasangan extension dan penggunaan rekaman langsung di Activity Timeline.','Tambahkan kredit Steven Andrian dan ChatGPT di footer dashboard.'],
  en:['Add an inline guide for installing the extension and using recordings in Activity Timeline.','Credit Steven Andrian and ChatGPT in the dashboard footer.']
 }},
 {version:'1.5.4',date:'2026-11-06',changes:{
  id:['Tambahkan filter jenis aktivitas dan kolom Platform di Activity Timeline.','Buka parameter, sumber bukti, endpoint, Measurement ID, status HTTP, dan konteks elemen dari baris timeline saat tersedia.','Pulihkan detail observasi event saat mengimpor laporan timeline v1.5.3.'],
  en:['Add an activity type filter and a Platform column to Activity Timeline.','Open parameters, evidence source, endpoint, Measurement ID, HTTP status, and element context from a timeline row when available.','Recover event observation details when importing v1.5.3 timeline reports.']
 }},
 {version:'1.5.3',date:'2026-11-06',changes:{
  id:['Activity Timeline menampilkan klik, scroll, submit form, navigasi, dan observasi event secara real-time di dashboard lokal.','Jeda dan lanjutkan rekaman pada mode real-time maupun JSON. JSON tetap bisa diekspor dan diimpor.','Perbarui tampilan panel Chrome dan tambahkan ikon tab dashboard.'],
  en:['Activity Timeline shows clicks, scrolls, form submissions, navigation, and observed events live in the local dashboard.','Pause and resume both live and JSON recordings. JSON export and import remain available.','Refresh the Chrome panel design and add a dashboard favicon.']
 }},
 {version:'1.5.2',date:'2026-11-06',changes:{
  id:['Tambahkan panel Rekam Manual di Chrome DevTools.','Impor sesi manual ke Event Explorer dan lihat lokasi halaman serta konteks klik.'],
  en:['Add a Manual Recording panel in Chrome DevTools.','Import manual sessions into Event Explorer to see page locations and click context.']
 }},
 {version:'1.5.1',date:'2026-11-06',changes:{
  id:['Coba sekali dengan HTTP/1.1 saat navigasi awal mengalami error protokol HTTP/2.','Tampilkan percobaan pemuatan dan tandai audit gagal ketika semua halaman yang diuji gagal.','Cegah cache mencoba menyelesaikan request yang sama dua kali.'],
  en:['Retry once over HTTP/1.1 when initial navigation hits an HTTP/2 protocol error.','Show navigation attempts and mark the audit as failed when all tested pages fail.','Prevent the asset cache from trying to finish the same request twice.']
 }},
 {version:'1.5.0',date:'2026-11-05',changes:{
  id:['Filter pemicu untuk page load, klik, impression, link keluar, submit, dan inventaris login/logout.','Rincian hasil uji per pemicu dan ekspor CSV Halaman & cakupan.','Batas klik 6, 10, 12, 20, 50, atau hingga 200.','Profil Ekspres memproses hingga 4 halaman bersamaan dengan jendela observasi 0,9 detik.'],
  en:['Trigger selection for page load, clicks, impressions, outbound links, submit attempts, and login/logout inventory.','Per-trigger test outcomes and Pages & coverage CSV export.','Click limits of 6, 10, 12, 20, 50, or up to 200.','Express processes up to four pages at a time with a 0.9-second observation window.']
 }},
 {version:'1.4.0',date:'2026-11-05',changes:{
  id:['Pemisahan aksi uji, halaman asal, halaman event, kategori, dan hubungan dengan klik/navigasi.','Ringkasan event per platform/nama dengan filter kategori dan akses ke observasi lengkap.','Cache aset statis sesuai header HTTP, statistik bertahap, ETA kasar, dan rincian performa.','Opsi pemakaian ulang halaman eksperimental; mode isolasi tetap menjadi bawaan.','Checkpoint otomatis per 15 detik dan resume per halaman dari checkpoint atau JSON versi lama.'],
  en:['Separate test actions, origin/event pages, categories, and click/navigation relationships.','Grouped platform/event summaries, category filters, and full observation drill-down.','HTTP-header-aware static asset caching, incremental statistics, rough ETA, and performance details.','Optional experimental page reuse; isolated clicks remain the default.','Automatic 15-second checkpoints and page-level resume from checkpoints or older JSON reports.']
 }},
 {version:'1.3.0',date:'2026-11-04',changes:{
  id:['Pilihan cakupan Seluruh website atau Satu URL saja sebelum audit.','Mode satu URL tidak mengambil sitemap atau mengikuti antrean link; query URL tetap dipertahankan.','Pemeriksaan tombol tetap berjalan dengan navigasi ke halaman lain ditahan dan dicatat pada rincian elemen.','Cakupan tersimpan pada laporan, dipulihkan setelah refresh, dan tersedia melalui CLI --scope single.'],
  en:['Choose Entire website or Single URL before an audit.','Single-URL mode skips sitemaps and link discovery while preserving URL query parameters.','Eligible click checks hold navigation to other pages and record it in element details.','Scope is stored in reports, restored after refresh, and available through CLI --scope single.']
 }},
 {version:'1.2.0',date:'2026-11-04',changes:{
  id:['Pilihan platform sebelum audit: GA4, dataLayer, MoEngage, Braze, dan Mixpanel.','Observasi pemanggilan SDK dan payload jaringan yang dikenali, dengan identitas platform pada event dan ekspor.','Filter platform hasil audit dan dukungan impor laporan v1.0/v1.1.','Workspace umum Website Event Audit; domain awal kosong dan laporan sampel tidak dimuat otomatis.'],
  en:['Pre-audit platform selection: GA4, dataLayer, MoEngage, Braze, and Mixpanel.','SDK-call and recognized network-payload observations with platform identity in events and exports.','Platform filtering and backward-compatible v1.0/v1.1 report import.','Generic Website Event Audit workspace, blank initial domain, and no automatically loaded sample.']
 }},
 {version:'1.1.0',date:'2026-11-04',changes:{
  id:['Pilihan bahasa Indonesia dan Inggris, disimpan di browser.','Timer berjalan dan durasi total pada laporan audit.','Kartu Perlu diperiksa membuka halaman bermasalah beserta alasan dan rincian elemennya.','Mode Seimbang, Cepat, dan Mendalam dengan pemeriksaan hingga 3 halaman bersamaan.','Nomor versi aplikasi dan mesin audit, serta riwayat perubahan.','Pembaruan hasil secara bertahap mendukung audit paralel; ekspor laporan lama tetap didukung.'],
  en:['Indonesian and English interface, remembered in the browser.','Live audit timer and total duration in audit reports.','Needs review card opens affected pages with reasons and element details.','Balanced, Fast, and Thorough modes with up to 3 concurrent pages.','Application and audit engine versions, plus release history.','Incremental report updates support parallel audits; older reports remain supported.']
 }},
 {version:'1.0.0',date:'2026-11-04',changes:{id:['Rilis awal: crawler sitemap dan link internal, observasi GA4/gtag/dataLayer, pemetaan elemen, serta ekspor CSV/JSON.'],en:['Initial release: sitemap and internal-link crawling, GA4/gtag/dataLayer observations, element mapping, and CSV/JSON export.']}}
];
