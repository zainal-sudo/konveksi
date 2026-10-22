-- Penjualan SO konveksi: kolom pembayaran multi-jenis (duplikasi pola kasir minimarket)
-- Pemetaan 1:1 dengan minimarket.tso_hdr:
--   so_bayar     = uang tunai / cash diterima (gross)
--   so_kembali   = kembalian = (cash+voucher+card+piutang) - (amount+ongkir), >= 0
--   so_dp        = kas tunai neto = max(0, cash - kembalian) -> yang masuk laci
--   so_voucher(+no), so_card(+no+bank), so_piutang = jalur pembayaran non tunai
--   so_ongkir    = biaya kirim; so_user_kasir = user login

ALTER TABLE tso_hdr ADD COLUMN so_dp         double NULL COMMENT 'Kas tunai neto = uang tunai - kembalian (jurnal kas)';
ALTER TABLE tso_hdr ADD COLUMN so_voucher    double NULL COMMENT 'Pembayaran voucher';
ALTER TABLE tso_hdr ADD COLUMN so_no_voucher varchar(50) NULL;
ALTER TABLE tso_hdr ADD COLUMN so_card       double NULL COMMENT 'Pembayaran card/debit/kredit';
ALTER TABLE tso_hdr ADD COLUMN so_no_card    varchar(50) NULL;
ALTER TABLE tso_hdr ADD COLUMN so_bank_card  varchar(50) NULL;
ALTER TABLE tso_hdr ADD COLUMN so_piutang    double NULL COMMENT 'Pembayaran piutang/bon (bukan tunai)';

-- (Sudah dijalankan di DB konveksi. so_ongkir/so_bayar/so_kembali/so_user_kasir sudah ada sebelumnya.)
