-- Master cabang: tempel akun persediaan barang (untuk jurnal mutasi antar cabang)
-- Mutasi OUT (pusat): Dr 17.002 PERSEDIAN INTRANSIT vs Cr akun persediaan cabang asal
-- Mutasi IN  (cabang): Dr akun persediaan cabang tujuan vs Cr 17.002 PERSEDIAN INTRANSIT

ALTER TABLE tcabang
  ADD COLUMN cbg_rek_persediaan varchar(8) NULL
  COMMENT 'Akun persediaan barang cabang (jurnal mutasi antar cabang)';

-- Nilai awal sesuai daftar akun yang sudah ada di trekening
UPDATE tcabang SET cbg_rek_persediaan = '17.004' WHERE cbg_kode = '00' AND (cbg_rek_persediaan IS NULL OR cbg_rek_persediaan = ''); -- PERSEDIAAN BARANG JADI PUSAT
UPDATE tcabang SET cbg_rek_persediaan = '17.006' WHERE cbg_kode = '01' AND (cbg_rek_persediaan IS NULL OR cbg_rek_persediaan = ''); -- PERSEDIAAN BARANG JADI AA
UPDATE tcabang SET cbg_rek_persediaan = '17.007' WHERE cbg_kode = '02' AND (cbg_rek_persediaan IS NULL OR cbg_rek_persediaan = ''); -- PERSEDIAAN BARANG JADI CC

-- (Di DB sudah dijalankan. Cabang baru: pilih akun persediaannya di master cabang,
--  kalau kosong pun jurnal tetap jalan dengan fallback akun jenis barang tgroup.gr_rek_kode
--  lalu 17.004, lihat be-konveksi/src/utils/jurnalMutasiCabang.js)
