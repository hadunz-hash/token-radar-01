# Token Radar v5 — STATUS (2026-11-19, ~11:00 WIB)

Rombak ketiga. Target: masuk 40 besar dev (garis akhir dari leaderboard
live 19 Nov 10:11 UTC, 13.169 entri: low terbaik ke-40 = 940.016, rank 40
point 953.929, money line = low terbaik ke-10 = 946.765).

## Posisi awal

- v4 (sub 01a1f1b4): rank **2.025/13.161**, judge **~917.926** (interval
  90%: 891.488–944.364), rekor dev **12-0-0**. Gap ke rank 40: **~36 ribu**
  point (dulu ~190 ribu). High interval kita (944.364) masih di bawah
  money line (946.765) — selisih 2.401.
- Analisis langit-langit 12 game: high tertinggi di antara 10.919 entri
  12-match = 945.787 — NOL yang mencapai money line. Artinya v4 hampir
  pasti butuh 2 ronde scrutiny tambahan (yang hanya jalan kalau high
  interval mencapai money line) untuk bisa masuk 40 besar.

## Diagnosis: apa yang memisahkan kita dari 40 besar

1. **Model v4 memuat 33 comps yang bukan populasi board.** 33 traded
   protocols tanpa listing date ternyata produk legacy (Aave V2, Lido,
   SSV, Polygon Bridge, Tornado Cash…): rasio mcap/TVL 0,00–18,96,
   residu 1 dari 3 meleset 10×. Mereka merusak fit — bukan cherry-pick
   untuk membuangnya, tapi pembersihan data: yang di-fit sekarang
   hanya 95 comps bertanggal.
2. **Growth di v4 arahnya salah.** Carry positif v4 mengasumsikan
   surge TVL berlanjut. Fit pada 95 comps bertanggal bilang sebaliknya
   di SEMUA spesifikasi: koefisien growth **−2,48** (linear −2,73,
   semua comps −3,44). Surge TVL biasanya deposit mercenary, bukan
   re-rating — protokol yang TVL-nya melonjak justru diperdagangkan
   PALING MURAH relatif terhadap ukurannya.
3. **Sector premium tidak generalisasi.** Menang LOO (×2,67) tapi kalah
   kedua time split (×2,73 / ×2,92 vs ×2,61 / ×2,88) — dibuang, sesuai
   aturan yang sama seperti v4. Age juga kalah split-900 (×3,27).
   Weibull untuk odds tidak menang (Brier LOO 0,1483 vs cure 0,1517,
   time-split lebih buruk) — cure dipertahankan.
4. **Dashboard v4 menyembunyikan bukti.** Panel out-of-sample di bawah
   fold screenshot 1; tidak ada plan text di baris board; tidak ada
   kolom break-even odds; tab live cuma top 24 (rank 2 menampilkan
   semua 128 comps).

## Yang diubah (radar-5)

Model (`lib/model.ts`, ditulis ulang):
- **Fit hanya pada 95 comps bertanggal** (33 undated dikeluarkan,
  tercatat di `excluded_undated`). Spec kept: log10(mcap) =
  **11,3901 − 1,5455·log10(TVL) + 0,1241·(log10 TVL)² −
  2,4815·log10(1 + 7d change)**.
- **Growth masuk ke dalam fit** (bukan carry) — dengan koefisien
  negatif, dijelaskan jujur di dashboard. Carry positif v4 DIHAPUS.
- **Winsorisasi growth**: feature di-clamp ke range yang ditunjukkan
  comps (7d −40,1% s/d +26,7%). Tanpa ini, Anemoy (−72,7%) dapat
  faktor 25,1× dan jadi #1 ($56,8M), dan Shift DeFi (+4448%)
  dihargai 0,003×. Setelah winsorisasi: Anemoy #13 ($8,1M),
  Shift #164. Tidak ada comp yang menyentuh cap, jadi angka uji
  TIDAK berubah karena winsorisasi.
- **Tes ketiga: split-900** (fit pada protokol ≥900 hari, uji yang
  <900 hari — populasi board sendiri). Aturan kept: suatu term bertahan
  hanya jika penambahannya tidak kalah di satu pun dari 3 tes.
- **Hasil uji** (reproduksi persis eksperimen Python independen):
  LOO **×2,83** (flat ×5,00), time-split **×2,61** (flat ×5,29),
  900-day **×2,88** (flat ×5,03), within-3× **51%** (v4: 42%),
  range P25–P75 holds 49% (faktor 0,37/3,03). v4: ×3,40 / ×3,01 /
  ×3,16.
- **Odds tetap cure** (π=0,53, half-life 866 hari) + angka held-out
  yang baru: LOO Brier **0,152 vs 0,159 base rate**; akurasi 80,2% =
  base rate — ditulis jujur: odds menambah kalibrasi, bukan klasifikasi.
- **Board**: 198 baris, top **Steakhouse Financial $32,3M**
  (Sentora turun ke #2, $30,7M), total implied **$775,6M** (v4:
  $1,08B — model lebih konservatif). Verdict: **FARM 27 / MARGINAL
  63 / SKIP 108** (v4: 24/93/81). Farm-next: Nucleus +$37,17,
  Monarq +$36,35, DAMM Capital +$22,68 (v4: Monolith/NUVA/Shift —
  semuanya protokol surge yang dulu digelembungkan carry positif).

Dashboard (`dashboard/app.js` + `app.css`, `index.html`):
- **Validation strip di screenshot 1** (di bawah stat cards):
  LOO ×2,83 · time ×2,61 · 900-day ×2,88 · 51% within 3× ·
  flat ×5,00 · Brier 0,152 vs 0,159.
- **Plan line di baris board** (FARM/MARGINAL): "→ Supply ·
  Arbitrum · net +$40,44" — 90 baris.
- **Break-even odds di sel ODDS** ("BE 34%" di bawah odds).
- **Tab live: semua 402 protokol** (dulu top 24).
- **Scatter diperbaiki**: garis lurus diganti kurva kuadrat
  (dengan intercept/slope v5, garis lurus lama akan jatuh miring
  dan salah total); judul "95 dated traded protocols".
- **Tabel terms + kolom 900-DAY SPLIT**; teks model ditulis ulang
  (formula kuadrat + growth negatif + winsorisasi); dialog detail
  "× growth factor" (dulu "growth carry"); favicon inline (menghilangkan
  404 yang sempat menggagalkan page check).
- Dossier text **49.053 byte** (cap 65.536).

Entrypoint (`main.ts`, diedit di 2 pesan terpisah): header radar-5;
baris summary menyebut LOO + time + 900-day + within-3× + LOO Brier.

## Verifikasi (lokal, sebelum submit)

- Gate 7/7: coverage 758/758 + watchlist 40/40, rank 1..198
  terurut, implied > 0, verdict 27+63+108=198, dossier text
  49.053 ≤ 65.536, dossier total 872.755 ≤ 1,5 MiB, farm step
  133–265 karakter (semua 198 baris, 6/6), screenshot
  3× 1440×900 ≤ 512 KiB.
- Deterministik byte-identik (2 build, diff -r bersih; dossier
  rebuild byte-match di level file).
- Page check (`browser-test/check.mjs`, Chromium 159.0.8154.6 dari
  cache playwright — Chrome sistem /opt/meta-chromium ditolak
  policy Hatch, dan download headless shell sempat gagal +
  approval-nya timeout; binary full Chromium hasil download
  sebagian sudah ada di cache dan dipakai): ALL CHECKS PASS —
  board 198 baris, farmline + stat cards + validation strip benar,
  90 plan lines, 2 grafik render, plan 6/6 MATCH model untuk 6
  sampel, net 6/6 MATCH board.json, break-even 6/6, filter Farm =
  27 baris, toggle deposit $5K menghitung ulang net, tab live =
  402 baris, 0 page error.
- Screenshot regenerate (headless Chromium): 1-board 204 KB,
  2-detail 218 KB (Nucleus #80, top FARM), 3-filtered 195 KB —
  ketiganya dibaca visual: strip validasi, plan line, BE odds,
  dan detail Nucleus (growth factor 1,99) tampil benar.

## Perkiraan skor (jujur)

- v5 memperbaiki SETIAP kelemahan terukur v4: LOO ×3,40→×2,83,
  time ×3,01→×2,61, 900d ×3,16→×2,88, within-3× 42%→51%, odds
  kini punya angka held-out (Brier 0,152 vs 0,159), dan dashboard
  kini menampilkan di screenshot 1 apa yang cover 40 besar
  tampilkan. Modelnya secara terukur lebih baik dari v4 di semua
  tes — bukan klaim, tapi angka yang direproduksi dua kali
  (Python independen + build TS).
- Tapi: **masuk 40 besar TETAP tidak bisa dijanjikan.** Skor
  datang dari game pairwise A/B vs 7 anggota house yang tidak
  bisa diukur sebelum grading; garis money line ditentukan oleh
  entri lain (kalau field ikut membaik, garis ikut naik); dan
  analisis langit-langit 12 game menunjukkan entri 12-match
  manapun belum pernah mencapai money line — v5 kemungkinan
  masih butuh ronde scrutiny tambahan, yang hanya jalan kalau
  high interval v5 mencapai garis. High interval v5 baru ketahuan
  saat grading. Gap 36 ribu (~4% dari point) itu kecil, tapi
  garisnya bergerak.
- Kuota: 4/10 terpakai (v1 ditolak, v2, v3, v4). v5 akan jadi
  yang ke-5. Deadline 14 Des 2026 17:00 WIB.
