const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

// ── List PO Open/Partial untuk dipilih ───────────────────────────────
const getPoOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT
       h.po_nomor    AS nomor,
       DATE_FORMAT(h.po_tanggal, '%Y-%m-%d') AS tanggal,
       s.sup_nama    AS supNama,
       h.po_memo     AS memo,
       CASE h.po_status_rec
         WHEN 0 THEN 'Open'
         WHEN 1 THEN 'Partial'
         ELSE 'Closed'
       END AS statusRec
     FROM tpo_hdr h
     LEFT JOIN tsupplier s ON h.po_sup_kode = s.sup_kode
     WHERE h.po_isclosed = 0
       AND h.po_status_rec < 2
       AND (h.po_nomor LIKE ? OR s.sup_nama LIKE ? OR h.po_memo LIKE ?)
     ORDER BY h.po_nomor DESC
     LIMIT 30`,
    [`%${search}%`, `%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── Detail PO beserta sisa qty yang belum diterima ───────────────────
const getPoDetail = async (poNomor) => {
  const [items] = await db.query(
    `SELECT 
       d.pod_nourut   AS podNourut,
       d.pod_brg_kode AS brgKode,
       b.brg_nama     AS brgNama,
       b.brg_kode     AS barcode,
       d.pod_brg_satuan   AS satuan,
       d.pod_qty      AS qtyPo,
       d.pod_harga    AS harga,
       d.pod_discpr   AS discPr,
       IFNULL(rec.total_terima, 0) AS qtySudahTerima,
       (d.pod_qty - IFNULL(rec.total_terima, 0)) AS qtySisa
     FROM tpo_dtl d
     LEFT JOIN tbarang b ON d.pod_brg_kode = b.brg_kode
     LEFT JOIN (
       SELECT h.bpb_po_nomor, d.bpbd_brg_kode, SUM(d.bpbd_qty) AS total_terima
       FROM tbpb_dtl d
       INNER JOIN tbpb_hdr h ON d.bpbd_bpb_nomor = h.bpb_nomor
       GROUP BY h.bpb_po_nomor, d.bpbd_brg_kode
     ) rec ON rec.bpb_po_nomor = d.pod_po_nomor AND rec.bpbd_brg_kode = d.pod_brg_kode
     WHERE d.pod_po_nomor = ?
     ORDER BY d.pod_nourut ASC`,
    [poNomor]
  );

  return items;
};

// ── List gudang untuk SearchModal ────────────────────────────────────
const getGudang = async (search = "") => {
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama, gdg_penanggungjawab AS pj
     FROM tgudang
     WHERE gdg_nama LIKE ? OR gdg_kode LIKE ?
     ORDER BY gdg_kode ASC
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── Load form BPB untuk mode edit ────────────────────────────────────
const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT bh.bpb_nomor AS nomor, DATE_FORMAT(bh.bpb_tanggal, '%Y-%m-%d') AS tanggal,
            bh.bpb_po_nomor AS poNomor, bh.bpb_gdg_kode AS gdgKode, bh.bpb_memo AS memo,
            bh.bpb_isinvoice AS isInvoice
     FROM tbpb_hdr bh WHERE bh.bpb_nomor = ?`, [nomor]
  );
  if (!h) throw new Error("BPB tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT
       d.bpbd_nourut        AS nourut,
       d.bpbd_brg_kode      AS brgKode,
       b.brg_nama           AS brgNama,
       b.brg_kode           AS barcode,
       d.bpbd_brg_satuan    AS satuan,
       d.bpbd_qty           AS qty,
       CASE WHEN d.bpbd_tgl_expired = '0000-00-00' THEN ''
            ELSE DATE_FORMAT(d.bpbd_tgl_expired, '%Y-%m-%d')
       END AS tglExpired,
       po_dtl.pod_qty       AS qtyPo,
       IFNULL(rec.total_terima, 0) AS qtySudahTerima,
       po_dtl.pod_nourut    AS podNourut
     FROM tbpb_dtl d
     LEFT JOIN tbpb_hdr h ON d.bpbd_bpb_nomor = h.bpb_nomor
     LEFT JOIN tbarang b ON d.bpbd_brg_kode = b.brg_kode
     LEFT JOIN tpo_dtl po_dtl ON po_dtl.pod_po_nomor = h.bpb_po_nomor AND po_dtl.pod_brg_kode = d.bpbd_brg_kode
     LEFT JOIN (
       SELECT h.bpb_po_nomor, d.bpbd_brg_kode, SUM(d.bpbd_qty) AS total_terima
       FROM tbpb_dtl d
       INNER JOIN tbpb_hdr h ON d.bpbd_bpb_nomor = h.bpb_nomor
       WHERE h.bpb_nomor <> ? -- <-- PENTING: Kecualikan BPB yang sedang diedit agar tidak double-count
       GROUP BY h.bpb_po_nomor, d.bpbd_brg_kode
     ) rec ON rec.bpb_po_nomor = h.bpb_po_nomor AND rec.bpbd_brg_kode = d.bpbd_brg_kode
     WHERE d.bpbd_bpb_nomor = ?
     ORDER BY d.bpbd_nourut ASC`,
    [nomor, nomor]
  );

  h.detail = detail;
  return h;
};

// ── Simpan BPB ────────────────────────────────────────────────────────
const saveData = async (payload, user) => {
  // Catatan: bpb_isinvoice TIDAK boleh diisi dari form/payload. Field ini
  // murni status sistem yang dikontrol trigger tinv_hdr_afterinsert/
  // afterupdate/afterdelete begitu invoice benar-benar dibuat/dihapus lewat
  // modul Invoice — penerimaan barang (BPB) selalu diasumsikan belum punya
  // invoice saat pertama kali dibuat.
  const { isEdit, nomor, tanggal, poNomor, gdgKode, memo, detail } = payload;
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;

  try {
    const now = new Date();
    const username = user?.username || "ADMIN";
    let actualNomor = nomor;

   const [[po]] = await conn.query(
      `SELECT po_status_rec, po_isclosed FROM tpo_hdr WHERE po_nomor = ? FOR UPDATE`,
      [poNomor]
    );
    if (!po) throw new Error("PO tidak ditemukan.");
    
    // Validasi closed HANYA untuk transaksi baru (Insert), bukan saat Edit
    if (!isEdit && (po.po_isclosed === 1 || po.po_status_rec >= 2)) {
      throw new Error("PO ini sudah closed, tidak bisa menerima barang lagi.");
    }

    if (isEdit) {
      // Hapus detail lama — trigger tbpb_dtl_after_delete otomatis
      // mengembalikan pod_qty_terima & status PO, jadi tidak perlu
      // di-UPDATE manual lagi di sini.
      await conn.query(`DELETE FROM tbpb_dtl WHERE bpbd_bpb_nomor = ?`, [actualNomor]);
      // bpb_isinvoice sengaja TIDAK ikut di-UPDATE — biarkan tetap dikontrol
      // oleh trigger invoice, bukan oleh form ini.
      await conn.query(
        `UPDATE tbpb_hdr
         SET bpb_tanggal=?, bpb_gdg_kode=?, bpb_memo=?, date_modified=?, user_modified=?
         WHERE bpb_nomor=?`,
        [tanggal, gdgKode, memo || "", now, username, actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `RI.${yy}${mm}.`;

      // Kunci atomik supaya 2 request bersamaan tidak dapat nomor yang sama.
      lockKey = `nomor_bpb_${yy}${mm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT bpb_nomor FROM tbpb_hdr WHERE bpb_nomor LIKE ? ORDER BY bpb_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.bpb_nomor) {
        const parts = maxRow.bpb_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      // bpb_isinvoice selalu dimulai dari 0 (belum ada invoice) untuk BPB baru.
      await conn.query(
        `INSERT INTO tbpb_hdr
           (bpb_nomor, bpb_tanggal, bpb_po_nomor, bpb_gdg_kode, bpb_memo, bpb_isinvoice, date_create, user_create)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [actualNomor, tanggal, poNomor, gdgKode, memo || "", now, username]
      );
    }

    let seq = 1;
    for (const d of detail) {
      const qty = Number(d.qty) || 0;
      if (qty <= 0) continue;

      const [[pod]] = await conn.query(
        `SELECT pod_qty, IFNULL(pod_qty_terima, 0) AS sudahTerima
         FROM tpo_dtl
         WHERE pod_po_nomor = ? AND pod_brg_kode = ?`,
        [poNomor, d.brgKode]
      );
      if (!pod) throw new Error(`Barang "${d.brgNama}" tidak ditemukan di PO.`);

      const sisaQty = pod.pod_qty - pod.sudahTerima;
      if (qty > sisaQty) {
        throw new Error(`Qty terima "${d.brgNama}" (${qty}) melebihi sisa PO (${sisaQty}).`);
      }

      const tglExp = d.tglExpired && d.tglExpired !== "" ? d.tglExpired : "0000-00-00";

      // Trigger tbpb_dtl_after_insert otomatis:
      // - menambah tpo_dtl.pod_qty_terima
      // - mengupdate pod_isclosed / po_status_rec / po_isclosed
      // Jadi TIDAK PERLU lagi UPDATE tpo_dtl/tpo_hdr manual di sini.
      await conn.query(
        `INSERT INTO tbpb_dtl
           (bpbd_bpb_nomor, bpbd_brg_kode, bpbd_brg_satuan, bpbd_qty, bpbd_tgl_expired, bpbd_nourut)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [actualNomor, d.brgKode, d.satuan, qty, tglExp, seq]
      );

      seq++;
    }

    // Catatan: bpb_isinvoice TIDAK di-set manual di sini.
    // Trigger tinv_hdr_afterinsert/afterupdate/afterdelete yang akan
    // mengubah bpb_isinvoice secara otomatis begitu invoice
    // benar-benar dibuat/dihapus lewat modul Invoice (invFormService).

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    if (lockKey) await releaseLock(conn, lockKey);
    conn.release();
  }
};

module.exports = { getPoOptions, getPoDetail, getGudang, getDetailForm, saveData };