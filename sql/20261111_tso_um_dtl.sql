-- ─── Penjualan pakai beberapa uang muka (Get DP) untuk SATU nota ────────
-- Sebelumnya 1 nota SO hanya bisa merujuk 1 deposit (tso_hdr.so_um_nomor).
-- Sekarang 1 nota bisa memotong beberapa penerimaan lain-lain sekaligus
-- (tombol GET DP di form penjualan, alokasi otomatis FIFO).
--
--   tso_um_dtl : detail pemakaian DP per nota (sumber kebenaran sisa deposit)
--   tso_hdr.so_umpenjualan tetap = TOTAL semua DP yang dipakai nota tsb
--   tso_hdr.so_um_nomor tetap diisi (deposit pertama) untuk kompatibilitas
--                  browse / print / data lama.

CREATE TABLE IF NOT EXISTS tso_um_dtl (
  so_umd_id INT NOT NULL AUTO_INCREMENT,
  so_umd_so_nomor varchar(50) NOT NULL COMMENT 'Nomor nota penjualan (tso_hdr)',
  so_umd_jur_no varchar(50) NOT NULL COMMENT 'Nomor penerimaan lain-lain (tjurnal) sumber DP',
  so_umd_nilai double NOT NULL DEFAULT 0 COMMENT 'Nilai DP deposit yang dipakai nota ini',
  so_umd_nourut int NOT NULL DEFAULT 1,
  PRIMARY KEY (so_umd_id),
  KEY idx_tso_umd_so (so_umd_so_nomor),
  KEY idx_tso_umd_jur (so_umd_jur_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrasi data lama: satu deposit per nota -> satu baris detail
INSERT INTO tso_um_dtl (so_umd_so_nomor, so_umd_jur_no, so_umd_nilai, so_umd_nourut)
SELECT h.so_nomor, h.so_um_nomor, IFNULL(h.so_umpenjualan, 0), 1
  FROM tso_hdr h
 WHERE IFNULL(h.so_umpenjualan, 0) > 0
   AND IFNULL(h.so_um_nomor, '') <> ''
   AND NOT EXISTS (SELECT 1 FROM tso_um_dtl u WHERE u.so_umd_so_nomor = h.so_nomor);
