# Token Radar v3 (radar-3) — status

## Apa yang diukur judge (dari kit RULES.txt + competition.yaml + leaderboard)

- Judge = superbot, baca 3 screenshot + teks dashboard (cap 65.536 byte),
  pairwise A/B, margin 1–5, tanpa seri; ranking dari Bradley-Terry win rate.
- Dev heat: 12 game vs 7 anggota house (4 dashboard fixed lemah→kuat +
  3 dashboard referensi). Final: screening di posisi 40, lalu 3 ronde Swiss,
  playoff 12 besar; 5 besar ditahan untuk finalist review.
- Rubrik, terpenting dulu: (1) radar yang bekerja — mencakup watchlist,
  ranking pre-token berdasarkan implied value yang dinyatakan, screenshot
  dan kode cocok; (2) model nilai — implied value dari angka snapshot
  sendiri (TVL, pertumbuhan 7 hari, umur tanpa token), bukan nama
  hardcode, pisahkan live-token dari pre-token; (3) farm plan konkret
  dengan biaya dan waktu; (4) dashboard sebagai halaman — bisa di-sort/
  filter, terbaca sekilas, detail per protokol; (5) tampilan.
- Ground truth BUKAN harga launch aktual — tidak ada di snapshot. Yang
  dinilai adalah kualitas jawaban atas "protokol pre-token mana yang
  paling layak di-farm berikutnya", dibaca dari dossier (screenshot +
  teks dashboard). Data.js dan board.json TIDAK masuk teks dossier —
  judge tidak pernah melihat data board atau tabel kalibrasi secara
  langsung, hanya screenshot + source dashboard.

## Apa yang salah di v2 (bukti, bukan dugaan)

- Board pada dasarnya tabel TVL: Spearman(rank implied, rank TVL) = 0,948.
- 115 dari 226 baris memakai persis multiple median global 0,2138
  (hanya 9 dari 34 kategori punya ≥5 live token); kolom Multiple di
  screenshot terbaca 0,2138 untuk baris 1–6.
- 43 dari 186 baris early berkategori yang definisi watchlist sendiri
  mengecualikan (Bridge, Canonical Bridge, Liquid Staking, Liquid
  Restaking, CEX) + 12 nama wrapped/staked/versioned — bukan kandidat
  "token belum ada" yang asli.
- Top-50: 34 baris bertumbuh NEGATIF 7 hari; pertumbuhan tercepat
  terkubur (Shift DeFi +4448% di #43, Monolith +163% di #170).
- Label "FDV/TVL" salah — snapshot tidak membawa FDV; yang dipakai
  adalah market-cap/TVL.
- Hasil: dev rating rank 10.562/12.506, judge 599.684 vs rank 40 =
  953.929. Kekurangan sistematis, bukan kalibrasi kecil.

## Yang diubah di radar-3

- Multiple per kategori: min_live 3 (bukan 5), shrink weight 5 (bukan 10)
  → 14 dari 34 kategori dapat multiple sendiri; 103 multiple berbeda di
  board (dulu 13).
- Size factor: multiple akhir = base × clamp((100M/TVL)^0,15, 0,70–1,30)
  — pasar membayar multiple lebih kaya untuk protokol yang lebih kecil/
  lebih awal; raksasa dipangkas.
- Faktor pertumbuhan: clamp(1 + growth/100, 0,30–5,00) dengan growth =
  clamp(change_7d, −70, 500) — menggantikan bobot 0,5 + cap 120 yang
  meratakan sinyal. Shift DeFi +4448% → rank 12 (dulu 43).
- Maturity dipadatkan ke 0,75–1,00 (dulu 0,60–1,00).
- Early radar memakai PENUH logika eksklusi watchlist: kategori Bridge/
  Canonical Bridge/Liquid Staking/Liquid Restaking/Restaked BTC/CEX;
  kata wrapped/staked/staking/restaked/restaking; prefix nama exchange;
  nama versioned. Early 137 baris (dulu 186), 0 baris berkategori
  terlarang. Board 177 baris (40 watchlist + 137 early), total implied
  $2,52B (dulu $2,81B).
- Label jujur "market-cap/TVL" di semua tempat (model, tabel kalibrasi,
  caption Live, footer).
- Farm plan: langkah 1 menyebut chain spesifik; langkah 4 mengikuti
  momentum protokol (tambah saat tumbuh ≥20%, kecil saat turun);
  langkah 5 menyebut nama protokol. Dicerminkan persis antara
  lib/model.ts dan dashboard/app.js.
- Dashboard: strip "Rising this week" (5 penumbuh tercepat), badge
  ▲ Rising di baris dengan growth ≥20% (9 baris), breakdown detail
  menampilkan base multiple + size factor, baris lebih rapat (7+ baris
  terlihat di screenshot board), formula model diperbarui.
- main.ts: ringkasan run menampilkan baris teratas + jumlah rising;
  guard ukuran dossier ≤1,5 MiB. lib/model.ts memakai multiple yang
  dibulatkan 4 desimal untuk hitung implied, supaya recompute halaman
  cocok persis dengan board.json.

## Verifikasi (lokal, sebelum submit)

- Gate 7/7: coverage watchlist 40/40, rank 1..177, terurut, farm step
  20–600 karakter, implied > 0, dossier ≤1,5 MiB (799.398 byte).
- Deterministik byte-identik (2 run, diff -r bersih).
- Dossier rebuild byte-match (vendored lib asli, dari out/).
- Plan halaman vs board.json: 6/6 sampel MATCH (rank 1, Shift #12,
  Veda #3, Upshift #5, Monolith #106, Theo thBill #63); recompute
  halaman 6/6 MATCH; tanpa page error.
- Screenshot regenerate (headless shell): 1-board 173 KB, 2-detail
  228 KB, 3-filtered 167 KB, 1440×900, ≤512 KiB.
- Top-10 baru: Steakhouse $352,4M; Gauntlet $218,1M; Veda $192,0M;
  USDD $126,2M; Upshift $82,8M; Bittensor dTAO $66,4M; Nonce Capital
  $59,0M; OnRe $56,9M; OpenTrade $48,0M; Plume Vaults $42,7M.
- Top-20: 7 baris bertumbuh positif (dulu 6); Spearman masih ~0,94 —
  TVL tak terhindarkan mendominasi nilai dolar, tapi diferensiasi
  yang terlihat jauh lebih baik.

## Perkiraan skor (jujur)

Skor judge tidak bisa diketahui sebelum submit. Yang bisa dikatakan:
v2 kalah sistematis di rubrik 1–2 (board = tabel TVL, multiple seragam,
baris early bukan kandidat asli); ketiganya diperbaiki secara terukur di
v3. Apakah itu cukup untuk masuk 40 besar (judge ≥ ~954 ribu) tidak
bisa dijanjikan — selisih skor di atas sangat rapat (rank 1000 masih
934 ribu), jadi perbaikan harus besar untuk naik jauh. v3 adalah
perbaikan terbesar yang bisa dilakukan tanpa mengubah konsep implied
value yang diminta lomba. Kalau v3 masih di bawah 40 besar, langkah
berikutnya yang masuk akal adalah membandingkan dossier kita dengan
dossier entri 40 besar yang repo-nya publik (jika ada) — bukan iterasi
buta lagi.
