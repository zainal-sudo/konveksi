const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

const getGudang = async (search = "") => {
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama FROM tgudang WHERE gdg_nama LIKE ? OR gdg_kode LIKE ? LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getBarang = async (search = "", gdgKode = "") => {
  const [rows] = await db.query(
    `SELECT 
       b.brg_kode AS kode, 
       b.brg_nama AS nama, 
       b.brg_kode AS barcode,
       sum(mst_stok_in-mst_stok_out) AS stok
     FROM tbarang b
     inner JOIN tmasterstok s ON b.brg_kode = s.mst_brg_kode AND s.mst_gdg_kode = ?
     WHERE b.brg_nama LIKE ? OR b.brg_kode LIKE ?
     GROUP BY mst_brg_kode
     LIMIT 30`,
    [gdgKode, `%${search}%`, `%${search}%`]
  );
  return rows;
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT mut_nomor AS nomor, DATE_FORMAT(mut_tanggal, '%Y-%m-%d') AS tanggal,
            mut_gdg_asal AS gdgAsal, mut_gdg_tujuan AS gdgTujuan, mut_keterangan AS memo
     FROM tmutasi_hdr WHERE mut_nomor = ?`, [nomor]
  );
  if (!h) throw new Error("Data Mutasi Gudang tidak ditemukan.");

  // Ambil nama gudang asal & tujuan untuk form edit
  const [[g1]] = await db.query(`SELECT gdg_nama FROM tgudang WHERE gdg_kode = ?`, [h.gdgAsal]);
  const [[g2]] = await db.query(`SELECT gdg_nama FROM tgudang WHERE gdg_kode = ?`, [h.gdgTujuan]);
  h.gdgAsalNama = g1?.gdg_nama || "";
  h.gdgTujuanNama = g2?.gdg_nama || "";

  const [detail] = await db.query(
    `SELECT
       d.mutd_brg_kode     AS brgKode,
       b.brg_nama           AS brgNama,
       b.brg_kode           AS barcode,
       d.mutd_qty           AS qty,
       d.mutd_expired       AS expired,
       d.mutd_keterangan    AS keterangan
     FROM tmutasi_dtl d
     LEFT JOIN tbarang b ON d.mutd_brg_kode = b.brg_kode
     WHERE d.mutd_mut_nomor = ?
     ORDER BY d.mutd_nourut ASC`,
    [nomor]
  );

  h.detail = detail;
  return h;
};

const saveData = async (payload, user) => {
  const { isEdit, nomor, tanggal, gdgAsal, gdgTujuan, memo, detail } = payload;
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;

  try {
    const now = new Date();
    const username = user?.username || "ADMIN";
    let actualNomor = nomor;

    if (gdgAsal === gdgTujuan) {
      throw new Error("Gudang asal dan gudang tujuan tidak boleh sama.");
    }

    if (isEdit) {
      await conn.query(`DELETE FROM tmutasi_dtl WHERE mutd_mut_nomor = ?`, [actualNomor]);
      await conn.query(
        `UPDATE tmutasi_hdr
         SET mut_tanggal=?, mut_gdg_asal=?, mut_gdg_tujuan=?, mut_keterangan=?, date_modified=?, user_modified=?
         WHERE mut_nomor=?`,
        [tanggal, gdgAsal, gdgTujuan, memo || "", now, username, actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `MTG.${yy}${mm}.`;

      lockKey = `nomor_mutasi_${yy}${mm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT mut_nomor FROM tmutasi_hdr WHERE mut_nomor LIKE ? ORDER BY mut_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.mut_nomor) {
        const parts = maxRow.mut_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      await conn.query(
        `INSERT INTO tmutasi_hdr
           (mut_nomor, mut_tanggal, mut_gdg_asal, mut_gdg_tujuan, mut_keterangan, mut_status, date_create, user_create)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`, // 👈 Set status 0 untuk data baru
        [actualNomor, tanggal, gdgAsal, gdgTujuan, memo || "", now, username]
      );
    }

    let nourut = 1;
    for (const d of detail) {
      const qty = Number(d.qty) || 0;
      if (qty <= 0) continue;

      await conn.query(
        `INSERT INTO tmutasi_dtl
           (mutd_mut_nomor, mutd_brg_kode, mutd_qty, mutd_expired, mutd_keterangan, mutd_nourut, mutd_gdg_kode)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [actualNomor, d.brgKode, qty, d.expired || "0000-00-00", d.keterangan || "", nourut, gdgAsal]
      );
      nourut++;
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



module.exports = { getGudang, getBarang, getDetailForm, saveData };