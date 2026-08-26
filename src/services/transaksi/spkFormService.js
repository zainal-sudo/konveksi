const db = require("../../config/database");
const detailSvc = require("./spkDetailService");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

const getBarangOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT
        brg_kode   AS kode,
        brg_kode   AS barcode,
        brg_nama   AS nama,
        brg_satuan AS satuan
     FROM tbarang
     WHERE brg_nama LIKE ? OR brg_kode LIKE ?
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getCustomerOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT cus_kode AS kode, cus_nama AS nama, cus_alamat AS alamat
     FROM tcustomer
     WHERE cus_nama LIKE ? OR cus_kode LIKE ?
     LIMIT 15`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT
        spk_nomor            AS nomor,
        spk_nama             AS nama,
        spk_brg_kode         AS brgKode,
        (SELECT b.brg_nama   FROM tbarang b WHERE b.brg_kode = spk_brg_kode)   AS brgNama,
        (SELECT b.brg_satuan FROM tbarang b WHERE b.brg_kode = spk_brg_kode)   AS satuan,
        spk_cus_kode         AS custKode,
        (SELECT c.cus_nama   FROM tcustomer c WHERE c.cus_kode = spk_cus_kode) AS custNama,
        DATE_FORMAT(spk_tanggal, '%Y-%m-%d')  AS tanggal,
        DATE_FORMAT(spk_dateline, '%Y-%m-%d') AS dateline,
        spk_jumlah           AS jumlah,
        spk_jumlah_jadi      AS jumlahJadi,
        spk_jumlah_kirim     AS jumlahKirim,
        spk_keterangan       AS keterangan,
        spk_harga            AS harga,
        spk_idbatch          AS idBatch
     FROM tspk WHERE spk_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("SPK tidak ditemukan.");
  return h;
};

// ✅ FIX: sebelumnya validasi HANYA ada di frontend (SpkFormView.vue
// validateSave()). Backend menerima apa saja tanpa dicek -- kalau request
// dikirim langsung ke API (bug FE, race condition, atau lewat luar
// browser), data ngasal (nama kosong, jumlah negatif, jumlahJadi >
// jumlah, dst) bisa kesimpen ke tspk. Validasi inti dari FE sekarang
// diduplikasi di sini sebagai lapisan terakhir yang tidak bisa dibypass.
const validatePayload = (payload) => {
  const { nama, brgKode, jumlah, jumlahJadi, jumlahKirim } = payload;

  if (!nama || !String(nama).trim()) {
    throw new Error("Nama SPK harus diisi.");
  }
  if (!brgKode || !String(brgKode).trim()) {
    throw new Error("Barang harus dipilih.");
  }
  const jml = Number(jumlah) || 0;
  const jmlJadi = Number(jumlahJadi) || 0;
  const jmlKirim = Number(jumlahKirim) || 0;

  if (jml <= 0) {
    throw new Error("Target Produksi harus lebih dari 0.");
  }
  if (jmlJadi > jml) {
    throw new Error("Jumlah Jadi tidak boleh melebihi Target Produksi.");
  }
  if (jmlKirim > jmlJadi) {
    throw new Error("Jumlah Kirim tidak boleh melebihi Jumlah Jadi.");
  }
};

const saveData = async (payload, user) => {
  validatePayload(payload);

  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const {
      isEdit, nomor, nama, brgKode, custKode, tanggal, dateline,
      jumlah, jumlahJadi, jumlahKirim, keterangan, harga, idBatch,
    } = payload;

    let actualNomor = nomor;

    if (isEdit) {
      await conn.query(
        `UPDATE tspk SET
            spk_nama = ?, spk_brg_kode = ?, spk_cus_kode = ?, spk_tanggal = ?, spk_dateline = ?,
            spk_jumlah = ?, spk_jumlah_jadi = ?, spk_jumlah_kirim = ?, spk_keterangan = ?,
            spk_harga = ?, spk_idbatch = ?
         WHERE spk_nomor = ?`,
        [
          nama, brgKode, custKode || null, tanggal, dateline || null,
          jumlah || 0, jumlahJadi || 0, jumlahKirim || 0, keterangan || "",
          harga || 0, idBatch || "", actualNomor,
        ]
      );
    } else {
      const d = new Date(tanggal);
      const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      const prefix = `SPK.${yyyymm}.`;

      // Kunci atomik supaya 2 request bersamaan tidak dapat nomor yang sama.
      lockKey = `nomor_spk_${yyyymm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT spk_nomor FROM tspk WHERE spk_nomor LIKE ? ORDER BY spk_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.spk_nomor) {
        const parts = maxRow.spk_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      actualNomor = `${prefix}${String(nextNum).padStart(3, "0")}`;

      await conn.query(
        `INSERT INTO tspk (
            spk_nomor, spk_nama, spk_brg_kode, spk_cus_kode, spk_tanggal, spk_dateline,
            spk_jumlah, spk_jumlah_jadi, spk_jumlah_kirim, spk_keterangan, spk_harga, spk_idbatch
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actualNomor, nama, brgKode, custKode || null, tanggal, dateline || null,
          jumlah || 0, jumlahJadi || 0, jumlahKirim || 0, keterangan || "", harga || 0, idBatch || "",
        ]
      );

      await detailSvc.generateDetailForSpk(conn, actualNomor, brgKode, jumlah || 0);
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

module.exports = { getBarangOptions, getCustomerOptions, getDetailForm, saveData };