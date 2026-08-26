const db = require("../../config/database");

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       h.bpb_nomor    AS Nomor,
       DATE_FORMAT(h.bpb_tanggal, '%Y-%m-%d') AS Tanggal,
       h.bpb_po_nomor AS NomorPO,
       g.gdg_nama     AS Gudang,
       h.bpb_memo     AS Memo,
       IF(h.bpb_isinvoice = 1, 'Ya', 'Belum') AS IsInvoice,
       COUNT(d.bpbd_brg_kode) AS JumlahItem
     FROM tbpb_hdr h
     LEFT JOIN tgudang g ON h.bpb_gdg_kode = g.gdg_kode
     LEFT JOIN tbpb_dtl d ON h.bpb_nomor = d.bpbd_bpb_nomor
     WHERE h.bpb_tanggal BETWEEN ? AND ?
     GROUP BY h.bpb_nomor, h.bpb_tanggal, h.bpb_po_nomor, g.gdg_nama, h.bpb_memo, h.bpb_isinvoice
     ORDER BY h.bpb_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

const deleteData = async (nomor) => {
  const [[rec]] = await db.query(
    `SELECT bpb_po_nomor FROM tbpb_hdr WHERE bpb_nomor = ?`,
    [nomor]
  );
  if (!rec) throw new Error("Data BPB tidak ditemukan.");

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const poNomor = rec.bpb_po_nomor;

    const [dtl] = await conn.query(
      `SELECT bpbd_brg_kode AS brgKode, bpbd_qty AS qty
       FROM tbpb_dtl WHERE bpbd_bpb_nomor = ?`,
      [nomor]
    );

    for (const d of dtl) {
      await conn.query(
        `UPDATE tpo_dtl
         SET pod_qty_terima = GREATEST(0, IFNULL(pod_qty_terima,0) - ?)
         WHERE pod_po_nomor = ? AND pod_brg_kode = ?`,
        [d.qty, poNomor, d.brgKode]
      );
    }

    await conn.query(
      `UPDATE tpo_hdr h
       SET h.po_status_rec = (
         SELECT CASE
           WHEN SUM(IFNULL(d.pod_qty_terima,0)) = 0 THEN 0
           WHEN SUM(IFNULL(d.pod_qty_terima,0)) >= SUM(d.pod_qty) THEN 2
           ELSE 1
         END
         FROM tpo_dtl d WHERE d.pod_po_nomor = ?
       )
       WHERE h.po_nomor = ?`,
      [poNomor, poNomor]
    );

    const invNomor = poNomor.replace("PO", "INV");
    await conn.query(`DELETE FROM tinv_dtl WHERE invd_inv_nomor = ?`, [invNomor]);
    await conn.query(`DELETE FROM tinv_hdr WHERE inv_nomor = ? AND inv_bpb_nomor = ?`, [invNomor, nomor]);

    await conn.query(`DELETE FROM tbpb_dtl WHERE bpbd_bpb_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tbpb_hdr WHERE bpb_nomor = ?`, [nomor]);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// Item BPB sekarang join ke tbarang (bahan sudah digabung ke tbarang,
// konsisten dengan poFormService/poService).
const getDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       d.bpbd_nourut        AS NoUrut,
       b.brg_kode           AS Barcode,
       b.brg_nama           AS NamaBarang,
       d.bpbd_brg_satuan    AS Satuan,
       d.bpbd_qty           AS Qty,
       CASE WHEN d.bpbd_tgl_expired = '0000-00-00' THEN '-'
            ELSE DATE_FORMAT(d.bpbd_tgl_expired, '%d-%m-%Y')
       END AS TglExpired
     FROM tbpb_dtl d
     LEFT JOIN tbarang b ON d.bpbd_brg_kode = b.brg_kode
     WHERE d.bpbd_bpb_nomor = ?
     ORDER BY d.bpbd_nourut ASC`,
    [nomor]
  );
  return rows;
};

module.exports = { getBrowse, deleteData, getDetail };