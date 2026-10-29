-- Master cabang: setting akun jurnal penjualan per cabang
-- Jurnal penjualan (be-konveksi/src/utils/jurnalPenjualan.js) akan memakai:
--   Dr Kas        -> tcabang.cbg_rek_kas        (fallback 11.002 KAS BESAR)
--   Dr Piutang    -> tcabang.cbg_rek_piutang    (fallback 14.001 PIUTANG DAGANG)
--   Cr Penjualan  -> tcabang.cbg_rek_penjualan  (fallback 21.001 PENJUALAN BARANG)
--   Cr Persediaan -> tcabang.cbg_rek_persediaan (kolom lama, fallback tgroup / 17.004)
-- Kolom kosong/NULL => pakai akun global seperti semula.

ALTER TABLE tcabang
  ADD COLUMN cbg_rek_kas varchar(8) NULL
    COMMENT 'Akun kas cabang (jurnal penjualan tunai)',
  ADD COLUMN cbg_rek_penjualan varchar(8) NULL
    COMMENT 'Akun penjualan cabang (jurnal penjualan)',
  ADD COLUMN cbg_rek_piutang varchar(8) NULL
    COMMENT 'Akun piutang dagang cabang (jurnal penjualan kredit)';

-- Nilai awal = akun global yang selama ini dipakai, silakan diubah per cabang
UPDATE tcabang SET cbg_rek_kas        = '11.002' WHERE cbg_rek_kas        IS NULL; -- KAS BESAR
UPDATE tcabang SET cbg_rek_penjualan  = '21.001' WHERE cbg_rek_penjualan  IS NULL; -- PENJUALAN BARANG
UPDATE tcabang SET cbg_rek_piutang    = '14.001' WHERE cbg_rek_piutang    IS NULL; -- PIUTANG DAGANG
