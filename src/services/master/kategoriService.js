const db = require("../../config/database");

/**
 * Struktur tkategori (3 tingkat, diturunkan dari format ktg_kode):
 *   Tingkat 1 - Departemen   -> kode "1"        (0 titik)
 *   Tingkat 2 - Sub Kategori -> kode "1.1"      (1 titik)
 *   Tingkat 3 - Kategori     -> kode "1.1.1"    (2 titik)
 *
 * Parent-child diturunkan dari kode (bukan kolom terpisah), contoh:
 *   "1.1.1" parent-nya "1.1", dan "1.1" parent-nya "1".
 */

// Hitung jumlah titik pada kode -> dots = tingkat - 1
const DOTS_EXPR = `(LENGTH(ktg_kode) - LENGTH(REPLACE(ktg_kode, '.', '')))`;

const getParentKode = (kode) => {
  const idx = kode.lastIndexOf(".");
  return idx === -1 ? null : kode.substring(0, idx);
};

const getTingkatFromKode = (kode) => (kode.match(/\./g) || []).length + 1;

/**
 * Ambil data kategori.
 * @param {number} [tingkat] - 1 (Departemen) / 2 (Sub Kategori) / 3 (Kategori)
 * @param {string} [parentKode] - jika diisi, hanya ambil child langsung dari kode ini
 */
const getAll = async (tingkat, parentKode) => {
  const where = [];
  const params = [];

  if (tingkat) {
    where.push(`${DOTS_EXPR} = ?`);
    params.push(Number(tingkat) - 1);
  }

  if (parentKode) {
    where.push(`ktg_kode LIKE ?`);
    params.push(`${parentKode}.%`);
  } else if (Number(tingkat) > 1) {
    // Tingkat > 1 tapi tidak ada parent spesifik -> tetap tampilkan semua di tingkat itu
  }

  const sql = `
    SELECT ktg_kode AS kode, ktg_nama AS nama, ktg_tingkat AS tingkat
    FROM tkategori
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY ktg_kode
  `;
  const [rows] = await db.query(sql, params);
  return rows;
};

const getById = async (kode) => {
  const [[row]] = await db.query(
    `SELECT ktg_kode AS kode, ktg_nama AS nama, ktg_tingkat AS tingkat
     FROM tkategori WHERE ktg_kode = ?`,
    [kode]
  );
  if (!row) throw new Error("Kategori tidak ditemukan.");
  return row;
};

// Cari nomor urut berikutnya di antara sibling (kode dengan parent & tingkat yang sama)
const getNextKode = async (tingkat, parentKode) => {
  const dots = Number(tingkat) - 1;
  let sql, params;

  if (!parentKode) {
    // Tingkat 1: kode top-level, contoh "1", "2", "4"
    sql = `
      SELECT MAX(CAST(ktg_kode AS UNSIGNED)) AS maxNum
      FROM tkategori
      WHERE ${DOTS_EXPR} = 0
    `;
    params = [];
  } else {
    sql = `
      SELECT MAX(CAST(SUBSTRING_INDEX(ktg_kode, '.', -1) AS UNSIGNED)) AS maxNum
      FROM tkategori
      WHERE ktg_kode LIKE ? AND ${DOTS_EXPR} = ?
    `;
    params = [`${parentKode}.%`, dots];
  }

  const [[row]] = await db.query(sql, params);
  const nextNum = (row.maxNum || 0) + 1;
  return parentKode ? `${parentKode}.${nextNum}` : `${nextNum}`;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama, tingkat, parentKode } = payload;

  if (!nama || !nama.trim()) throw new Error("Nama kategori wajib diisi.");

  if (isEdit) {
    if (!kode) throw new Error("Kode kategori tidak valid.");
    await db.query(`UPDATE tkategori SET ktg_nama = ? WHERE ktg_kode = ?`, [
      nama.trim(),
      kode,
    ]);
    return { kode };
  }

  // ── Insert baru ──────────────────────────────────────────────────
  const tingkatNum = Number(tingkat);
  if (![1, 2, 3].includes(tingkatNum)) {
    throw new Error("Tingkat kategori tidak valid (harus 1, 2, atau 3).");
  }

  if (tingkatNum > 1) {
    if (!parentKode) {
      throw new Error(
        tingkatNum === 2
          ? "Departemen induk wajib dipilih."
          : "Sub Kategori induk wajib dipilih."
      );
    }
    const [[parent]] = await db.query(
      `SELECT ktg_kode, ktg_tingkat FROM tkategori WHERE ktg_kode = ?`,
      [parentKode]
    );
    if (!parent) throw new Error("Kategori induk tidak ditemukan.");
    if (Number(parent.ktg_tingkat) !== tingkatNum - 1) {
      throw new Error("Kategori induk berada di tingkat yang tidak sesuai.");
    }
  }

  const newKode = await getNextKode(tingkatNum, tingkatNum > 1 ? parentKode : null);

  await db.query(
    `INSERT INTO tkategori (ktg_kode, ktg_nama, ktg_tingkat) VALUES (?, ?, ?)`,
    [newKode, nama.trim(), tingkatNum]
  );

  return { kode: newKode };
};

const deleteData = async (kode) => {
  const [[child]] = await db.query(
    `SELECT COUNT(*) AS c FROM tkategori WHERE ktg_kode LIKE ?`,
    [`${kode}.%`]
  );
  if (child.c > 0) {
    throw new Error(
      "Kategori tidak dapat dihapus karena masih memiliki sub-data di bawahnya."
    );
  }

  // TODO: tambahkan cek referensi ke tbarang/tproduk dsb jika sudah ada tabelnya,
  // supaya kategori yang sudah dipakai transaksi tidak bisa dihapus begitu saja.

  await db.query(`DELETE FROM tkategori WHERE ktg_kode = ?`, [kode]);
};

module.exports = {
  getAll,
  getById,
  saveData,
  deleteData,
  getParentKode,
  getTingkatFromKode,
};