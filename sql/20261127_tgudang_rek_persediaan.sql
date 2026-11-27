-- Master gudang: tempel akun persediaan barang per gudang.
-- Dipakai jurnal Koreksi / Penyesuaian Stok (tkor_hdr/tkor_dtl):
--   - Koreksi POSITIF : Dr akun persediaan gudang vs Cr 23.016 BY PENYESUAIAN STOK
--   - Koreksi NEGATIF : Dr 23.016 BY PENYESUAIAN STOK vs Cr akun persediaan gudang
--
-- Kalau gdg_rek_persediaan kosong, jurnal fallback ke akun persediaan cabang
-- gudang (tcabang.cbg_rek_persediaan), lalu ke akun jenis barang
-- (tgroup.gr_rek_kode), lalu 17.004.

ALTER TABLE tgudang
  ADD COLUMN gdg_rek_persediaan varchar(8) NULL
  COMMENT 'Akun persediaan barang gudang (jurnal koreksi/penyesuaian stok)';

-- Nilai awal: ikut akun persediaan cabang masing-masing gudang.
UPDATE tgudang g
  JOIN tcabang c ON c.cbg_kode = g.gdg_cbg_kode
  SET g.gdg_rek_persediaan = c.cbg_rek_persediaan
  WHERE (g.gdg_rek_persediaan IS NULL OR g.gdg_rek_persediaan = '');
