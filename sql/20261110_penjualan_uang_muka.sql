-- ─── Penjualan pakai Uang Muka (deposit dari Penerimaan Lain-Lain) ───────
-- 1) tso_hdr  : nilai uang muka yang dipakai + nomor penerimaan lain sumbernya
-- 2) tcabang  : setting akun uang muka penjualan per cabang → posting
--               otomatis di jurnal penjualan (Dr akun UM saat bayar pakai UM)

ALTER TABLE tso_hdr
  ADD COLUMN so_umpenjualan double NULL
    COMMENT 'Nilai uang muka (Penerimaan Lain-Lain) yang dipakai bayar nota',
  ADD COLUMN so_um_nomor varchar(50) NULL
    COMMENT 'Nomor penerimaan lain-lain (tjurnal) sumber uang muka';

ALTER TABLE tcabang
  ADD COLUMN cbg_rek_umpenjualan varchar(8) NULL
    COMMENT 'Akun uang muka penjualan (jurnal penjualan bayar pakai UM)';

-- Nilai awal = akun uang muka penjualan global (19.001 UANG MUKA PENJUALAN)
UPDATE tcabang SET cbg_rek_umpenjualan = '19.001' WHERE cbg_rek_umpenjualan IS NULL; -- UANG MUKA PENJUALAN
