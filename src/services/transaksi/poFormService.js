const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

const getSupplierOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT sup_kode AS kode, sup_nama AS nama, sup_alamat AS alamat, sup_telp AS telp, sup_top AS top
     FROM tsupplier 
     WHERE sup_nama LIKE ? OR sup_kode LIKE ? LIMIT 15`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// Item PO sekarang diambil dari tbarang (bahan sudah menyatu ke tbarang).
const getBarangOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT 
        brg_kode      AS kode,
        brg_kode      AS barcode,
        brg_nama      AS nama,
        brg_satuan    AS satuan,
        brg_hrgbeli   AS hrgBeli
     FROM tbarang 
     WHERE brg_nama LIKE ? OR brg_kode LIKE ?
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT po_nomor AS nomor, DATE_FORMAT(po_tanggal, '%Y-%m-%d') AS tanggal,
            po_sup_kode AS supKode, 
            (SELECT s.sup_nama FROM tsupplier s WHERE s.sup_kode = po_sup_kode) AS supNama,
            (SELECT s.sup_alamat FROM tsupplier s WHERE s.sup_kode = po_sup_kode) AS supAlamat,
            (SELECT s.sup_telp FROM tsupplier s WHERE s.sup_kode = po_sup_kode) AS supTelp,
            (SELECT s.sup_top FROM tsupplier s WHERE s.sup_kode = po_sup_kode) AS supTop,
            po_memo AS memo, po_istax AS isTax, po_disc_fakturpr AS discFakturPr, po_disc_faktur AS discFaktur,
            po_amount AS amount, po_taxamount AS taxAmount, DATE_FORMAT(po_dateline, '%Y-%m-%d') AS dateline, po_pemesan AS pemesan
     FROM tpo_hdr WHERE po_nomor = ?`, [nomor]
  );
  if (!h) throw new Error("PO tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT d.pod_nourut AS no, d.pod_brg_kode AS brgKode, b.brg_nama AS brgNama, b.brg_kode AS barcode,
            d.pod_brg_satuan AS satuan, d.pod_qty AS qty, d.pod_harga AS harga, d.pod_discpr AS discPr,
            d.pod_keterangan AS keterangan
     FROM tpo_dtl d
     LEFT JOIN tbarang b ON d.pod_brg_kode = b.brg_kode
     WHERE d.pod_po_nomor = ? ORDER BY d.pod_nourut ASC`, [nomor]
  );

  h.detail = detail;
  return h;
};

const saveData = async (payload, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const { isEdit, nomor, tanggal, supKode, memo, isTax, discFakturPr, discFaktur, amount, taxAmount, dateline, pemesan, detail } = payload;
    const now = new Date();
    const username = user?.username || "ADMIN";
    let actualNomor = nomor;

    if (isEdit) {
      const [[current]] = await conn.query(`SELECT po_status_rec FROM tpo_hdr WHERE po_nomor = ?`, [actualNomor]);
      if (current && current.po_status_rec > 0) throw new Error("PO tidak bisa diubah karena sudah ada barang masuk.");

      await conn.query(`DELETE FROM tpo_dtl WHERE pod_po_nomor = ?`, [actualNomor]);
      await conn.query(
        `UPDATE tpo_hdr SET po_tanggal=?, po_sup_kode=?, po_memo=?, po_istax=?, po_disc_fakturpr=?, po_disc_faktur=?, 
                            po_amount=?, po_taxamount=?, date_modified=?, user_modified=?, po_dateline=?, po_pemesan=? WHERE po_nomor=?`,
        [tanggal, supKode, memo || "", isTax, discFakturPr, discFaktur, amount, taxAmount, now, username, dateline || null, pemesan || "", actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `PO.${yy}${mm}.`;

      // ✅ Segmentasi nomor berdasar status pajak dlm periode yg sama:
      // Pajak (isTax > 0)   -> 0001-4999 (digit pertama "0")
      // Non-Pajak (isTax=0) -> 5001-9999 (digit pertama "5")
      const isPajak = Number(isTax) > 0;
      const rangeStart = isPajak ? 1 : 5001;
      const rangeEnd = isPajak ? 4999 : 9999;

      // Kunci atomik per-segmen supaya 2 request bersamaan tidak dapat nomor yang sama.
      lockKey = `nomor_po_${yy}${mm}_${isPajak ? "pjk" : "nonpjk"}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT po_nomor FROM tpo_hdr 
         WHERE po_nomor LIKE ? 
           AND CAST(SUBSTRING_INDEX(po_nomor, '.', -1) AS UNSIGNED) BETWEEN ? AND ?
         ORDER BY po_nomor DESC LIMIT 1`,
        [`${prefix}%`, rangeStart, rangeEnd]
      );
      let nextNum = rangeStart;
      if (maxRow?.po_nomor) {
        const parts = maxRow.po_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      if (nextNum > rangeEnd) {
        throw new Error(`Kuota nomor PO ${isPajak ? "Pajak" : "Non-Pajak"} untuk periode ${yy}${mm} sudah habis.`);
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      await conn.query(
        `INSERT INTO tpo_hdr (po_nomor, po_tanggal, po_sup_kode, po_memo, po_istax, po_disc_fakturpr, po_disc_faktur, po_amount, po_taxamount, date_create, user_create, po_dateline, po_pemesan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [actualNomor, tanggal, supKode, memo || "", isTax, discFakturPr, discFaktur, amount, taxAmount, now, username, dateline || null, pemesan || ""]
      );
    }

    let index = 1;
    for (const item of detail) {
      await conn.query(
        `INSERT INTO tpo_dtl (pod_po_nomor, pod_brg_kode, pod_brg_satuan, pod_qty, pod_discpr, pod_harga, pod_keterangan, pod_nourut, brg_kode_lama)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [actualNomor, item.brgKode, item.satuan, item.qty, item.discPr || 0, item.harga, item.keterangan || "", index, item.brgKodeLama || item.kodeLama || "-"]
      );
      index++;
    }

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

module.exports = { getSupplierOptions, getBarangOptions, getDetailForm, saveData };