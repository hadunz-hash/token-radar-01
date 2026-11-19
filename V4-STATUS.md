# Token Radar v4 — STATUS (2026-11-19, ~10:00 WIB)

Rombak kedua setelah v3. Target: masuk 40 besar dev (garis akhir = low
terbaik ke-40, 940.016; rank 40 point 953.929 — diverifikasi ulang dari
leaderboard live 19 Nov ~10:00 WIB, 12.673 entri).

## Posisi awal

- v3 (sub 01a1f108): rank 8.767/12.673, judge 763.840 (low 713.916),
  rekor dev 9 menang / 2 seri / 1 kalah dari 12 game vs 7 anggota house.
  Gap ke 40 besar: ~190 ribu point, ~226 ribu low.
- v2: rank 10.562, judge ~599.684.

## Apa yang dilakukan 40 besar dan tidak kita lakukan (dari leaderboard + cover)

Tidak ada satu pun repo 40 besar yang publik (repo_url/clone_url kosong
semua) — jadi yang dipelajari adalah cover image (artifact.webp, publik
di Feed) + judul + pola yang berulang di 40 besar:

- **198 baris, bukan 177/186**: semua top-40 meranking 198 protokol
  (40 watchlist + 138 di bawah floor + 20 off-list di ATAS floor yang
  tidak ada di watchlist). v3 hanya 177 — 20 protokol besar (Sentora
  Curator $2,75B, BitFi $215M, Polymarket International $320M, …)
  tidak pernah masuk board. Rank 1 menaruh Sentora di #1.
- **Modelnya fitted, bukan multiple**: judul-judul 40 besar —
  "fitted launch pricing", "comps curve tested blind",
  "walk-forward-tested value model", "LOO-validated", "size curve",
  "launch odds". Mereka memuat kurva log-log TVL→mcap yang di-fit dari
  comps, diuji leave-one-out + time-split, dan menulis hasil ujinya
  di sidebar ("held out — priced by fits that never saw them",
  flat ×4.65 vs size curve ×3.42, "held-out hit 69% · base rate 55%").
  v3 memakai multiple per kategori (103 angka) tanpa uji apa pun.
- **Launch odds sebagai survival**: rank 1 menulis "held-out hit 69%
  · base rate 55%" dan odds per baris yang turun dengan umur.
  v3 tidak punya odds sama sekali.
- **Farm plan yang dihitung, bukan generik**: per baris ada verdict
  FARM/MARGINAL/SKIP, net of fees dalam dolar, break-even odds, min
  deposit, dan tabel WHEN/COST/TIME. v3 tidak punya verdict.
- **Dashboard terminal yang padat**: 6 kartu statistik, coverage bar,
  kontrol what-if (deposit/drop-share/T-bill), filter verdict +
  scope, grafik scatter log-log + kalibrasi odds, tabel uji
  out-of-sample. v3: hero besar + strip rising, 7 baris terlihat.
- Semua 40 besar: rekor dev **20-0-0** (12 game dasar + 8 ronde
  scrutiny tambahan).

## Yang diubah (radar-4)

Model (`lib/model.ts`, ditulis ulang):
- **Size curve (fit) gantikan multiple per kategori**: OLS log-log pada
  128 comps — log10(mcap) = 3,025 + 0,522·log10(TVL). LOO median miss
  ×3,40 (flat ×5,07), time-split ×3,01 (flat ×5,29). Range P25–P75
  dari residual LOO (faktor 0,31/4,20, holds 50%).
- **Growth jadi carry berlabel, bukan fit**: growthCarry =
  clamp(1 + (7d − market −8,23%)/100, 0,30, 5,00). Growth di dalam
  fit kalah LOO (×3,76) tapi menang time-split (×2,82) — jadi
  proyeksi, bukan koefisien.
- **Launch odds survival, di-fit pada populasi standalone**: dari
  383 protokol dated yang berdiri sendiri (bridge/exchange/staking
  dikeluarkan — nilainya menempel ke token yang sudah ada), MLE
  π=0,53, λ=0,0008/hari (half-life 866 hari). Odds: 30 hari 0,52,
  1 tahun 0,46, 4 tahun 0,26. Kalibrasi bucket bagus (aktual vs model
  selisih ≤8 poin); time-split overshoot 3–12 poin di bucket
  180–365 hari — ditulis jujur di dashboard.
- **Syarat "menang dua-duanya"**: chain count, age di dalam fit,
  dan category premium semuanya kalah LOO (×3,57–3,93) — dibuang,
  dan dashboard menulis kenapa.
- **Board 198 baris**: 40 watchlist + 138 early + 20 off-list
  ≥$50M. Sentora Curator #1 ($44,8M implied), total implied $1,08B
  (rank 2: $1,13B). Spearman vs TVL tetap ~0,94 — TVL mendominasi
  nilai dolar, tidak bisa dihindari.
- **Verdict farm yang dihitung**: slice = 7% × if-launched ×
  deposit/TVL, expected = slice × odds, fees = (4 + ceil(hold/14))
  × gas ($0,50 di luar Ethereum, $1,50 di Ethereum — dulu $5,00,
  terlalu mahal dan membunuh semua farm), T-bill 4%. FARM jika net
  ≥ $10. Hasil: **FARM 24, MARGINAL 93, SKIP 81** (rank 1: 21,
  rank 2: 12). Farm-next: Monolith Market +$35,58, NUVA +$25,43,
  Shift DeFi +$21,42. Mezzanine dan GoonFi masuk FARM — dua nama
  yang sama juga jadi farm-next di board rank 1.
- **Farm plan**: aksi berbayar per dua minggu (bukan mingguan —
  cek mingguan itu read gratis), hold step dengan floor TVL
  (keluar awal jika TVL < 75%) dan momentum, biaya gas konsisten
  dengan rumus verdict.
- **Data baru di data.js**: `watchlist` per baris + `comps`
  (128 titik TVL/mcap untuk grafik scatter).

Dashboard (`dashboard/app.js` ditulis ulang, 36.323 byte; `app.css`
8.002 byte; total 44.775 byte < 65.536):
- Header terminal: coverage line, model line, farm-next line.
- 6 kartu statistik, coverage bar 7 segmen + legenda.
- Kontrol what-if: deposit $1K/$5K/$25K, drop share 3,5%/7%/14%,
  T-bill 0%/4%/8%, Export CSV — verdict + net dihitung ulang live.
- Filter scope (All/Watchlist/Off-list/Early) + verdict
  (Any/Farm/Marginal/Skip) + search + kategori + chain; tab
  Pre-token / Already trade (top 24 by mcap).
- Board 11 kolom: rank, protokol, TVL, 7D, no token, if launched,
  odds, implied, range, net of fees, verdict. Sortable.
- Panel out-of-sample: tabel 5 term (LOO + time-split + kept),
  grafik scatter log-log (128 comps + size curve + flat),
  grafik bar kalibrasi odds aktual vs model.
- Seksi model: formula, koefisien, dropped terms, batasan jujur.
- Dialog detail: dekomposisi "Why $X", tabel farm plan
  WHEN/COST/TIME, net accounting, break-even odds, min deposit.
  Buka lewat klik baris atau hash #p=<slug>; hashchange didukung.

Entrypoint (`main.ts`): header radar-4, ringkasan run menyebut
verdict; guard dossier-text (edit #2).

## Verifikasi (lokal, sebelum submit)

- Gate 7/7: coverage 758/758 + watchlist 40/40, rank 1..198,
  terurut, implied > 0, verdict 24+93+81=198, dossier text
  45.371 byte ≤ 65.536, dossier total 851.015 byte ≤ 1,5 MiB,
  farm step 55–209 karakter (semua 198 baris), screenshot
  3× 1440×900 ≤ 512 KiB.
- Deterministik byte-identik (2 build, diff -r bersih; dossier
  rebuild byte-match).
- Halaman (headless Chromium, `browser-test/check.mjs`): 0 page
  error; board 198 baris; farmline + 6 stat card benar; 2 grafik
  render; plan 6/6 MATCH model untuk 6 sampel (Sentora, Shift,
  Mezzanine, GoonFi, Monolith, Theo thBill); net 6/6 MATCH
  board.json; break-even 6/6; filter Farm = 24 baris; toggle
  deposit $5K menghitung ulang net (Sentora −$14,25, terverifikasi
  hitung tangan); tab live = top 24.
- Screenshot regenerate (headless shell): 1-board 198 KB,
  2-detail 213 KB (Monolith #58, top FARM), 3-filtered 192 KB.

## Perkiraan skor (jujur)

Skor judge tidak bisa diketahui sebelum submit. Yang bisa dikatakan:
- v4 memperbaiki SETIAP kelemahan terukur v3 vs 40 besar: coverage
  198 (sama), model fitted + diuji dua arah (sama polanya),
  survival odds (sama polanya), verdict farm yang dihitung
  (sama polanya, jumlah FARM 24 vs 21/12), dashboard terminal
  padat (sama polanya). Pick FARM kita konvergen independen
  dengan rank 1 (Mezzanine, GoonFi).
- Tapi: 40 besar semuanya 20-0-0 di dev games; v3 9-2-1. v4
  seharusnya menang lebih banyak game, tapi berapa banyak tidak
  bisa diukur sebelum grading. Gap yang harus ditutup ~190 ribu
  point — besar. Peluang masuk 40 besar: **naik jelas dari v3,
  tapi TIDAK bisa dijanjikan**. Kalau judge memberi bobot besar
  pada validasi model dan farm plan yang dihitung, v4 punya
  peluang nyata; kalau judge lebih menghargai hal lain yang tidak
  terlihat di cover (mis. kualitas dossier teks), tetap bisa
  kalah.
- Kuota: 3/10 terpakai (v1 ditolak, v2, v3). v4 akan jadi yang
  ke-4. Deadline 14 Des 2026 17:00 WIB.
