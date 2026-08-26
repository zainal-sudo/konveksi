const db = require("../../config/database");



const getCabangList = async () => {
  const [rows] = await db.query(
    `SELECT CONCAT(cbg_kode, ' - ', cbg_nama) AS cabang FROM tcabang ORDER BY cbg_kode`,
  );
  return rows.map((r) => r.cabang);
};

// ── Daftar menu (men_modul=1 = Finance) ──────────────────────────────
const getAllMenus = async () => {
  const [rows] = await db.query(
    `SELECT
       men_id         AS id,
       men_nama       AS kode,
       men_keterangan AS nama
     FROM tmenu
     WHERE men_modul = 1
     ORDER BY men_id`,
  );
  return rows;
};

// ── Detail user + hak akses ──────────────────────────────────────────
const getDetail = async (kode) => {
  const [[user]] = await db.query(
    `SELECT
       user_kode          AS kode,
       user_nama          AS nama,
       user_password      AS password,
       user_cabang        AS cabang,
       user_aktif         AS aktif
     FROM tuser
     WHERE user_kode = ?`,
    [kode],
  );
  if (!user) return null;

  const [menus] = await db.query(
    `SELECT
       hak_men_id      AS menu_id,
       hak_men_view    AS view_,
       hak_men_insert  AS insert_,
       hak_men_edit    AS edit_,
       hak_men_delete  AS delete_
     FROM thakuser
     WHERE hak_user_kode = ?`,
    [kode],
  );

  return { ...user, menus };
};

// ── Simpan user + hak akses ──────────────────────────────────────────
const save = async (data, isEdit) => {
  const { kode, nama, password, cabang, aktif, editReport, menus } = data;

  if (!kode || !kode.trim()) throw new Error("Kode user wajib diisi.");
  if (!nama || !nama.trim()) throw new Error("Nama user wajib diisi.");

  if (isEdit) {
    await db.query(
      `UPDATE tuser SET
         user_nama         = ?,
         user_password     = ?,
         user_cabang       = ?,
         user_aktif        = ?,      
         date_modify       = NOW()
       WHERE user_kode = ?`,
      [nama, password ?? "", cabang, aktif, kode],
    );
  } else {
    const [[existing]] = await db.query(
      `SELECT user_kode FROM tuser WHERE user_kode = ?`,
      [kode],
    );
    if (existing) throw new Error("Kode user sudah digunakan.");

    await db.query(
      `INSERT INTO tuser
         (user_kode, user_nama, user_password, user_cabang,
          user_aktif, date_create)
       VALUES (?, ?, ?, ?, ?,  NOW())`,
      [kode, nama, password ?? "", cabang, aktif, editReport ?? 0],
    );
  }

  // Hapus semua hak lama → insert yang punya minimal satu Y
  await db.query(`DELETE FROM thakuser WHERE hak_user_kode = ?`, [kode]);

  if (menus && menus.length > 0) {
    const filtered = menus.filter(
      (m) =>
        m.view_ === "Y" ||
        m.insert_ === "Y" ||
        m.edit_ === "Y" ||
        m.delete_ === "Y",
    );

    if (filtered.length > 0) {
      const values = filtered.map((m) => [
        kode,
        m.menu_id,
        m.view_ || "N",
        m.insert_ || "N",
        m.edit_ || "N",
        m.delete_ || "N",
      ]);
      await db.query(
        `INSERT INTO thakuser
           (hak_user_kode, hak_men_id, hak_men_view, hak_men_insert, hak_men_edit, hak_men_delete)
         VALUES ?`,
        [values],
      );
    }
  }

  return { kode };
};

module.exports = { getCabangList, getAllMenus, getDetail, save };
