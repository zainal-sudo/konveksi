const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");
const { createAutoJurnalStbj } = require("../../utils/jurnalStbj");
const { cekTutupPeriode } = require("../tutupBukuService");

// Gudang tujuan STBJ hanya yang milik cabang pusat ('00') — produksi
// barang jadi tidak boleh masuk stok cabang penjualan.
const getGudang = async (search = "") => {
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama FROM tgudang
      WHERE gdg_cbg_kode = '00'
        AND (gdg_nama LIKE ? OR gdg_kode LIKE ?)
      LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const GUDANG_HARUS_CABANG = "00"; // pusat

const getBarang = async (search = "") => {
  const [rows] = await db.query(
    `SELECT brg_kode AS kode, brg_nama AS nama, brg_kode AS barcode FROM tbarang WHERE brg_nama LIKE ? OR brg_kode LIKE ? LIMIT 30`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT stbj_nomor AS nomor, DATE_FORMAT(stbj_tanggal, '%Y-%m-%d') AS tanggal,
            stbj_gdg_kode AS gdgKode, stbj_gdgp_kode AS gdgpKode, stbj_keterangan AS memo
     FROM tstbj_hdr WHERE stbj_nomor = ?`, [nomor]
  );
  if (!h) throw new Error("Data STBJ tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT
       d.stbjd_brg_kode     AS brgKode,
       b.brg_nama           AS brgNama,
       b.brg_kode           AS barcode,
       d.stbjd_jumlah       AS jumlah,
       d.stbjd_koli         AS koli,
       d.stbjd_keterangan   AS keterangan
     FROM tstbj_dtl d
     LEFT JOIN tbarang b ON d.stbjd_brg_kode = b.brg_kode
     WHERE d.stbjd_stbj_nomor = ?`,
    [nomor]
  );

  h.detail = detail;
  return h;
};

const saveData = async (payload, user) => {
  const { isEdit, nomor, tanggal, gdgKode, gdgpKode, memo, detail } = payload;
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;

  try {
    const now = new Date();
    const username = user?.username || "ADMIN";
    let actualNomor = nomor;

    // Periode yang sudah ditutup tidak boleh menerima STBJ (jurnalnya akan
    // memasuki buku besar).
    const tutup = await cekTutupPeriode(tanggal);
    if (tutup) throw new Error(`Periode yang memuat tanggal ${tanggal} sudah ditutup. STBJ tidak bisa disimpan.`);

    // Gudang tujuan wajib milik cabang pusat ('00')
    const [[gdg]] = await conn.query(
      `SELECT gdg_cbg_kode FROM tgudang WHERE gdg_kode = ?`, [gdgKode]
    );
    if (!gdg) throw new Error(`Gudang ${gdgKode} tidak ditemukan.`);
    if ((gdg.gdg_cbg_kode || "00") !== GUDANG_HARUS_CABANG) {
      throw new Error("STBJ hanya boleh menstok barang jadi di gudang cabang pusat ('00' — Pusat).");
    }

    if (isEdit) {
      await conn.query(`DELETE FROM tstbj_dtl WHERE stbjd_stbj_nomor = ?`, [actualNomor]);
      await conn.query(
        `UPDATE tstbj_hdr
         SET stbj_tanggal=?, stbj_gdg_kode=?, stbj_gdgp_kode=?, stbj_keterangan=?, date_modified=?, user_modified=?
         WHERE stbj_nomor=?`,
        [tanggal, gdgKode, gdgpKode || null, memo || "", now, username, actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `STBJ.${yy}${mm}.`;

      lockKey = `nomor_stbj_${yy}${mm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT stbj_nomor FROM tstbj_hdr WHERE stbj_nomor LIKE ? ORDER BY stbj_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.stbj_nomor) {
        const parts = maxRow.stbj_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      await conn.query(
        `INSERT INTO tstbj_hdr
           (stbj_nomor, stbj_tanggal, stbj_gdg_kode, stbj_gdgp_kode, stbj_keterangan, date_create, user_create)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [actualNomor, tanggal, gdgKode, gdgpKode || null, memo || "", now, username]
      );
    }

    for (const d of detail) {
      const jumlah = Number(d.jumlah) || 0;
      if (jumlah <= 0) continue;

      await conn.query(
        `INSERT INTO tstbj_dtl
            (stbjd_stbj_nomor, stbjd_brg_kode, stbjd_jumlah, stbjd_koli, stbjd_keterangan)
          VALUES (?, ?, ?, ?, ?)`,
        [actualNomor, d.brgKode, jumlah, Number(d.koli) || 0, d.keterangan || ""]
      );
    }

    // ── Jurnal otomatis STBJ ──────────────────────────────────────────
    // Dr Persediaan Barang Jadi (HPP=bahan+biaya produksi)
    //   vs Cr Persediaan Bahan + Cr Biaya Produksi (23.001)
    // Nomor jurnal = nomor STBJ (idempotent, regenerasi saat edit).
    // Trigger DB sudah mengurus stoknya; jurnal memakai nilai stok yang sama.
    await createAutoJurnalStbj(conn, {
      nomor: actualNomor,
      tanggal,
      keterangan: memo ? `Produksi Barang Jadi - ${memo}` : `Produksi Barang Jadi ${actualNomor}`,
      user: username,
    });

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