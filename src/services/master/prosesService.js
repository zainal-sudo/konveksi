const db = require("../../config/database");

/**
 * Master Proses + Proses Detail (tahapan).
 * Contoh: Proses "EARLOOP" -> detail: Mesin, Packing, Finishing.
 *
 * tmaster_proses      : header proses
 * tmaster_proses_dtl  : baris tahapan per proses, tiap tahap bisa (opsional)
 *                       terkait ke tbarang (dipakai nanti di SPK).
 *
 * Catatan MyISAM: tidak ada FOREIGN KEY yg di-enforce DB, jadi semua validasi
 * relasi (kode proses harus ada, brg_kode harus ada di tbarang) dicek manual
 * di service ini sebelum INSERT/UPDATE.
 */

// ── Kode proses otomatis: PRS.0001, PRS.0002, dst ──────────────────────
const getNextKode = async (conn) => {
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(prs_kode, '.', -1) AS UNSIGNED)) AS maxNum
     FROM tmaster_proses WHERE prs_kode LIKE 'PRS.%'`
  );
  const nextNum = (row.maxNum || 0) + 1;
  return `PRS.${String(nextNum).padStart(4, "0")}`;
};

// GET /master/proses -> daftar header saja (utk Browse)
const getAll = async () => {
  const [rows] = await db.query(
    `SELECT 
      p.prs_kode AS kode,
      p.prs_nama AS nama,
      p.prs_keterangan AS keterangan,
      p.prs_aktif AS aktif,
      (SELECT COUNT(*) FROM tmaster_proses_dtl d WHERE d.prsd_prs_kode = p.prs_kode) AS jumlahTahap
     FROM tmaster_proses p
     ORDER BY p.prs_kode`
  );
  return rows;
};

// GET /master/proses/:kode -> header + seluruh detail tahapannya (utk Form edit)
const getById = async (kode) => {
  const [[header]] = await db.query(
    `SELECT prs_kode AS kode, prs_nama AS nama, prs_keterangan AS keterangan, prs_aktif AS aktif
     FROM tmaster_proses WHERE prs_kode = ?`,
    [kode]
  );
  if (!header) throw new Error("Proses tidak ditemukan.");

  const [details] = await db.query(
    `SELECT 
      d.prsd_id AS id,
      d.prsd_urutan AS urutan,
      d.prsd_nama AS nama,
      d.prsd_brg_kode AS brgKode,
      b.brg_nama AS brgNama,
      d.prsd_keterangan AS keterangan
     FROM tmaster_proses_dtl d
     LEFT JOIN tbarang b ON d.prsd_brg_kode = b.brg_kode
     WHERE d.prsd_prs_kode = ?
     ORDER BY d.prsd_urutan`,
    [kode]
  );

  return { ...header, details };
};

// POST /master/proses/save
// payload: { isEdit, kode, nama, keterangan, aktif, details: [{ urutan, nama, brgKode, keterangan }] }
const saveData = async (payload) => {
  const { isEdit, kode, nama, keterangan, aktif, details } = payload;

  if (!nama || !nama.trim()) throw new Error("Nama proses wajib diisi.");
  if (!Array.isArray(details) || details.length === 0) {
    throw new Error("Minimal harus ada 1 tahapan (mis. Mesin, Packing, Finishing).");
  }

  // Validasi tiap baris detail
  const seenUrutan = new Set();
  for (const d of details) {
    if (!d.nama || !d.nama.trim()) {
      throw new Error("Nama tahapan tidak boleh kosong.");
    }
    const urutan = Number(d.urutan);
    if (!urutan || urutan < 1) {
      throw new Error(`Urutan tahapan "${d.nama}" tidak valid.`);
    }
    if (seenUrutan.has(urutan)) {
      throw new Error(`Urutan tahapan ${urutan} dipakai lebih dari sekali.`);
    }
    seenUrutan.add(urutan);
  }

  // Validasi brgKode yang diisi harus benar-benar ada di tbarang
  // (MyISAM tidak enforce FK, jadi wajib dicek manual di sini)
  const brgKodeList = details.map((d) => d.brgKode).filter((v) => v !== null && v !== undefined && v !== "");
  if (brgKodeList.length > 0) {
    const [foundRows] = await db.query(
      `SELECT brg_kode FROM tbarang WHERE brg_kode IN (?)`,
      [brgKodeList]
    );
    const foundSet = new Set(foundRows.map((r) => r.brg_kode));
    const missing = brgKodeList.filter((k) => !foundSet.has(k));
    if (missing.length > 0) {
      throw new Error(`Barang dengan kode "${missing.join(", ")}" tidak ditemukan di Master Barang.`);
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const now = new Date();
    let actualKode = kode;

    if (isEdit) {
      if (!kode) throw new Error("Kode proses tidak valid.");
      const [[existing]] = await conn.query(
        `SELECT prs_kode FROM tmaster_proses WHERE prs_kode = ?`,
        [kode]
      );
      if (!existing) throw new Error("Proses tidak ditemukan.");

      await conn.query(
        `UPDATE tmaster_proses 
         SET prs_nama = ?, prs_keterangan = ?, prs_aktif = ?, date_modified = ?
         WHERE prs_kode = ?`,
        [nama.trim(), keterangan || "", aktif ? 1 : 0, now, kode]
      );

      // Cek dulu apakah ada prsd_id lama yang mau dihapus (tidak ada lagi di payload)
      // sudah kepakai referensi di transaksi lain (mis. SPK). Untuk sekarang blm ada
      // tabel SPK, jadi langsung replace semua detail (delete + insert ulang).
      await conn.query(`DELETE FROM tmaster_proses_dtl WHERE prsd_prs_kode = ?`, [kode]);
    } else {
      actualKode = await getNextKode(conn);
      await conn.query(
        `INSERT INTO tmaster_proses (prs_kode, prs_nama, prs_keterangan, prs_aktif, date_create)
         VALUES (?, ?, ?, ?, ?)`,
        [actualKode, nama.trim(), keterangan || "", aktif ? 1 : 0, now]
      );
    }

    for (const d of details) {
      await conn.query(
        `INSERT INTO tmaster_proses_dtl 
          (prsd_prs_kode, prsd_urutan, prsd_nama, prsd_brg_kode, prsd_keterangan, date_create)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [actualKode, Number(d.urutan), d.nama.trim(), d.brgKode || null, d.keterangan || "", now]
      );
    }

    await conn.commit();
    return { kode: actualKode };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const deleteData = async (kode) => {
  // TODO: kalau tabel SPK yang menggaet tmaster_proses sudah ada, tambahkan
  // pengecekan referensi di sini supaya proses yang sudah dipakai transaksi
  // tidak bisa dihapus begitu saja (sama seperti catatan TODO di kategoriService).
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM tmaster_proses_dtl WHERE prsd_prs_kode = ?`, [kode]);
    const [result] = await conn.query(`DELETE FROM tmaster_proses WHERE prs_kode = ?`, [kode]);
    if (result.affectedRows === 0) throw new Error("Proses tidak ditemukan.");
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = { getAll, getById, saveData, deleteData };