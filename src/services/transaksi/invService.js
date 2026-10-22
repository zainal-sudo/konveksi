const db = require("../../config/database");
const { deleteAutoJurnalInv } = require("../../utils/jurnalInv");

// CATATAN: fungsi updateStatusBayar (tandai lunas manual) SENGAJA dihapus.
// Status lunas (inv_isbayar) & sisa hutang (inv_bayar) SEHARUSNYA hanya
// berubah lewat modul Pembayaran Supplier -- trigger DB
// tbayarsup_dtl_after_insert/after_delete yang otomatis mengurus ini saat
// user benar-benar membayar/hapus pembayaran. Kalau status bisa diubah
// manual dari sini, datanya bisa "Lunas" padahal inv_bayar masih 0 (belum
// ada uang masuk sama sekali) -- laporan hutang jadi tidak akurat.

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
        i.inv_nomor      AS Nomor,
        DATE_FORMAT(i.inv_tanggal, '%Y-%m-%d') AS Tanggal,
        DATE_FORMAT(i.inv_jthtempo, '%Y-%m-%d') AS JatuhTempo,
        i.inv_bpb_nomor  AS NomorBPB,
        h.bpb_po_nomor   AS NomorPO,
        i.inv_nobukti    AS Nobukti,
        s.sup_nama       AS Supplier,
        i.inv_memo       AS Memo,
        IF(i.inv_istax > 0, 'Ya', 'Tidak') AS Pajak,
        i.inv_amount     AS Total,
        i.inv_taxamount  AS Ppn,
        i.inv_freight    AS Freight,
        IFNULL(i.inv_bayar, 0) AS Bayar,
        IFNULL((SELECT SUM(r.ret_amount) FROM tret_hdr r WHERE r.ret_inv_nomor = i.inv_nomor), 0) AS Retur,
        CASE
          WHEN IFNULL(i.inv_bayar, 0) <= 0 THEN 'Belum'
          WHEN i.inv_bayar >= i.inv_amount THEN 'Lunas'
          ELSE 'Sebagian'
        END AS StatusBayar,
        (SELECT COUNT(*) FROM tinv_dtl d WHERE d.invd_inv_nomor = i.inv_nomor) AS JumlahItem
     FROM tinv_hdr i
     LEFT JOIN tbpb_hdr h  ON i.inv_bpb_nomor = h.bpb_nomor
     LEFT JOIN tpo_hdr p   ON h.bpb_po_nomor = p.po_nomor
     LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
     WHERE i.inv_tanggal BETWEEN ? AND ?
     ORDER BY i.inv_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

const getDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
        d.invd_nourut     AS NoUrut,
        b.brg_kode        AS Barcode,
        b.brg_nama        AS NamaBarang,
        d.invd_brg_satuan AS Satuan,
        d.invd_qty        AS Qty,
        d.invd_harga      AS Harga,
        d.invd_discpr     AS DiscPr
     FROM tinv_dtl d
     LEFT JOIN tbarang b ON d.invd_brg_kode = b.brg_kode
     WHERE d.invd_inv_nomor = ?
     ORDER BY d.invd_nourut ASC`,
    [nomor]
  );
  return rows;
};

const deleteData = async (nomor) => {
  const [[rec]] = await db.query(
    `SELECT inv_bpb_nomor, inv_isbayar FROM tinv_hdr WHERE inv_nomor = ?`,
    [nomor]
  );
  if (!rec) throw new Error("Invoice tidak ditemukan.");
  if (rec.inv_isbayar > 0) {
    throw new Error("Invoice yang sudah dibayar tidak dapat dihapus.");
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(`DELETE FROM tinv_dtl WHERE invd_inv_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tinv_hdr WHERE inv_nomor = ?`, [nomor]);

    if (rec.inv_bpb_nomor) {
      await conn.query(
        `UPDATE tbpb_hdr SET bpb_isinvoice = 0 WHERE bpb_nomor = ?`,
        [rec.inv_bpb_nomor]
      );
    }

    // Jurnal otomatis invoice ikut dihapus (nomor jurnal = nomor invoice)
    await deleteAutoJurnalInv(conn, nomor);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Data print (slip Invoice Pembelian) ──────────────────────────────
const getPrintData = async (nomor) => {
  // 1. Header Invoice + Supplier (lewat BPB & PO)
  const [[header]] = await db.query(
    `
    SELECT
      i.inv_nomor          AS nomor,
      DATE_FORMAT(i.inv_tanggal, '%d/%m/%Y') AS tanggal,
      DATE_FORMAT(i.inv_jthtempo, '%d/%m/%Y') AS jatuhtempo,
      IFNULL(i.inv_bpb_nomor, '') AS nomorbpb,
      IFNULL(i.inv_memo, '') AS memo,
      IFNULL(i.inv_amount, 0) AS amount,
      IFNULL(i.inv_taxamount, 0) AS taxamount,
      IFNULL(i.inv_freight, 0) AS freight,
      IFNULL(i.inv_bayar, 0) AS bayar,
      IFNULL(s.sup_nama, '') AS sup_nama,
      IFNULL(s.sup_alamat, '') AS sup_alamat,
      IFNULL(s.sup_telp, '') AS sup_telp,
      IFNULL(s.sup_fax, '') AS sup_fax
    FROM tinv_hdr i
    LEFT JOIN tbpb_hdr h ON i.inv_bpb_nomor = h.bpb_nomor
    LEFT JOIN tpo_hdr p  ON h.bpb_po_nomor = p.po_nomor
    LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
    WHERE i.inv_nomor = ?
    `,
    [nomor]
  );
  if (!header) throw new Error("Data Invoice tidak ditemukan.");

  // 2. Detail items Invoice
  const [detail] = await db.query(
    `
    SELECT
      d.invd_nourut       AS nourut,
      b.brg_kode          AS barcode,
      IFNULL(b.brg_nama, '') AS brgNama,
      IFNULL(d.invd_brg_satuan, '') AS satuan,
      IFNULL(d.invd_qty, 0) AS qty,
      IFNULL(d.invd_harga, 0) AS harga,
      IFNULL(d.invd_discpr, 0) AS discPr
    FROM tinv_dtl d
    LEFT JOIN tbarang b ON d.invd_brg_kode = b.brg_kode
    WHERE d.invd_inv_nomor = ?
    ORDER BY d.invd_nourut ASC
    `,
    [nomor]
  );

  // 3. Company info
  const [[perusahaan]] = await db.query(
    `SELECT perush_nama, perush_alamat, perush_kota, perush_NOtelp
     FROM tperusahaan LIMIT 1`
  );

  // 4. Hitung nilai Retur jika ada
  const [[returData]] = await db.query(
    `SELECT IFNULL(SUM(ret_amount), 0) AS total_retur 
     FROM tret_hdr WHERE ret_inv_nomor = ?`,
    [nomor]
  );
  const retur = Number(returData?.total_retur || 0);

  const amount = Number(header.amount);
  const taxamount = Number(header.taxamount);
  const freight = Number(header.freight);

  return {
    nomor: header.nomor,
    tanggal: header.tanggal,
    jatuhtempo: header.jatuhtempo,
    nomorbpb: header.nomorbpb,
    memo: header.memo,
    amount,
    taxamount,
    freight,
    retur,
    total: amount,
    sup_nama: header.sup_nama,
    sup_alamat: header.sup_alamat,
    sup_telp: header.sup_telp,
    sup_fax: header.sup_fax,
    perusahaan: perusahaan ? {
      nama: perusahaan.perush_nama,
      alamat: perusahaan.perush_alamat,
      kota: perusahaan.perush_kota,
      notelp: perusahaan.perush_NOtelp,
    } : { nama: '', alamat: '', kota: '', notelp: '' },
    detail,
  };
};

const getExportDetailData = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
        i.inv_nomor      AS Nomor,
        DATE_FORMAT(i.inv_tanggal, '%Y-%m-%d') AS Tanggal,
        DATE_FORMAT(i.inv_jthtempo, '%Y-%m-%d') AS JatuhTempo,
        i.inv_bpb_nomor  AS NomorBPB,
        i.inv_nobukti    AS Nobukti,
        s.sup_nama       AS Supplier,
        i.inv_memo       AS Memo,
        CASE
          WHEN IFNULL(i.inv_bayar, 0) <= 0 THEN 'Belum'
          WHEN i.inv_bayar >= i.inv_amount THEN 'Lunas'
          ELSE 'Sebagian'
        END AS StatusBayar,
        d.invd_nourut     AS NoUrut,
        b.brg_kode        AS Barcode,
        b.brg_nama        AS NamaBarang,
        d.invd_brg_satuan AS Satuan,
        IFNULL(d.invd_qty, 0) AS Qty,
        IFNULL(d.invd_harga, 0) AS Harga,
        IFNULL(d.invd_discpr, 0) AS DiscPr
     FROM tinv_hdr i
     LEFT JOIN tbpb_hdr h  ON i.inv_bpb_nomor = h.bpb_nomor
     LEFT JOIN tpo_hdr p   ON h.bpb_po_nomor = p.po_nomor
     LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
     LEFT JOIN tinv_dtl d  ON i.inv_nomor = d.invd_inv_nomor
     LEFT JOIN tbarang b   ON d.invd_brg_kode = b.brg_kode
     WHERE i.inv_tanggal BETWEEN ? AND ?
     ORDER BY i.inv_nomor DESC, d.invd_nourut ASC`,
    [startDate, endDate]
  );
  return rows;
};
module.exports = { getBrowse, getDetail, deleteData,getPrintData ,getExportDetailData};