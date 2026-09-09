const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

const getCustomerOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT cus_kode AS kode, cus_nama AS nama, cus_alamat AS alamat, cus_telp AS telp, cus_top AS top
     FROM tcustomer
     WHERE cus_nama LIKE ? OR cus_kode LIKE ?
     LIMIT 15`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getBarangOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT
        brg_kode      AS kode,
        brg_kode      AS barcode,
        brg_nama      AS nama,
        brg_satuan    AS satuan,
        brg_hrgjual   AS hrgJual
     FROM tbarang
     WHERE brg_nama LIKE ? OR brg_kode LIKE ?
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT so_nomor AS nomor, DATE_FORMAT(so_tanggal, '%Y-%m-%d') AS tanggal,
            so_cus_kode AS cusKode,
            (SELECT c.cus_nama FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusNama,
            (SELECT c.cus_alamat FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusAlamat,
            (SELECT c.cus_telp FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusTelp,
            (SELECT c.cus_top FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusTop,
            so_memo AS memo, so_istax AS isTax, so_disc_fakturpr AS discFakturPr, so_disc_faktur AS discFaktur,
            so_amount AS amount, so_taxamount AS taxAmount,
            DATE_FORMAT(so_dateline, '%Y-%m-%d') AS dateline, so_pemesan AS pemesan
     FROM tso_hdr WHERE so_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("Penjualan tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT d.sod_nourut AS no, d.sod_brg_kode AS brgKode, b.brg_nama AS brgNama, b.brg_kode AS barcode,
            d.sod_brg_satuan AS satuan, d.sod_qty AS qty, d.sod_harga AS harga, d.sod_discpr AS discPr,
            d.sod_keterangan AS keterangan
     FROM tso_dtl d
     LEFT JOIN tbarang b ON d.sod_brg_kode = b.brg_kode
     WHERE d.sod_so_nomor = ? ORDER BY d.sod_nourut ASC`,
    [nomor]
  );

  h.detail = detail;
  return h;
};

const saveData = async (payload, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const {
      isEdit,
      nomor,
      tanggal,
      cusKode,
      memo,
      isTax,
      discFakturPr,
      discFaktur,
      amount,
      taxAmount,
      dateline,
      pemesan,
      detail,
    } = payload;
    const now = new Date();
    const username = user?.username || user?.kode || "ADMIN";
    let actualNomor = nomor;

    if (!cusKode) throw new Error("Customer harus dipilih.");
    if (!Array.isArray(detail) || detail.length === 0) {
      throw new Error("Detail barang tidak boleh kosong.");
    }

    if (isEdit) {
      const [[current]] = await conn.query(
        `SELECT so_status_rec, so_isclosed FROM tso_hdr WHERE so_nomor = ?`,
        [actualNomor]
      );
      if (!current) throw new Error("Data penjualan tidak ditemukan.");
      if (current.so_status_rec > 0) throw new Error("Penjualan tidak bisa diubah karena sudah ada pengiriman.");
      if (current.so_isclosed === 1) throw new Error("Penjualan berstatus Closed tidak bisa diubah.");

      await conn.query(`DELETE FROM tso_dtl WHERE sod_so_nomor = ?`, [actualNomor]);
      await conn.query(
        `UPDATE tso_hdr SET so_tanggal=?, so_cus_kode=?, so_memo=?, so_istax=?, so_disc_fakturpr=?, so_disc_faktur=?,
                            so_amount=?, so_taxamount=?, date_modified=?, user_modified=?, so_dateline=?, so_pemesan=?
         WHERE so_nomor=?`,
        [
          tanggal,
          cusKode,
          memo || "",
          isTax,
          discFakturPr || 0,
          discFaktur || 0,
          amount,
          taxAmount,
          now,
          username,
          dateline || null,
          pemesan || "",
          actualNomor,
        ]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `SO.${yy}${mm}.`;
      const isPajak = Number(isTax) > 0;
      const rangeStart = isPajak ? 1 : 5001;
      const rangeEnd = isPajak ? 4999 : 9999;

      lockKey = `nomor_so_${yy}${mm}_${isPajak ? "pjk" : "nonpjk"}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT so_nomor FROM tso_hdr
         WHERE so_nomor LIKE ?
           AND CAST(SUBSTRING_INDEX(so_nomor, '.', -1) AS UNSIGNED) BETWEEN ? AND ?
         ORDER BY so_nomor DESC LIMIT 1`,
        [`${prefix}%`, rangeStart, rangeEnd]
      );
      let nextNum = rangeStart;
      if (maxRow?.so_nomor) {
        const parts = maxRow.so_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      if (nextNum > rangeEnd) {
        throw new Error(`Kuota nomor penjualan ${isPajak ? "Pajak" : "Non-Pajak"} untuk periode ${yy}${mm} sudah habis.`);
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      await conn.query(
        `INSERT INTO tso_hdr (so_nomor, so_tanggal, so_cus_kode, so_memo, so_istax, so_disc_fakturpr, so_disc_faktur,
                               so_amount, so_taxamount, date_create, user_create, so_dateline, so_pemesan, so_user_kasir)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actualNomor,
          tanggal,
          cusKode,
          memo || "",
          isTax,
          discFakturPr || 0,
          discFaktur || 0,
          amount,
          taxAmount,
          now,
          username,
          dateline || null,
          pemesan || "",
          username,
        ]
      );
    }

    let index = 1;
    for (const item of detail) {
      await conn.query(
        `INSERT INTO tso_dtl (sod_so_nomor, sod_brg_kode, sod_brg_satuan, sod_qty, sod_discpr, sod_harga, sod_keterangan, sod_nourut, brg_kode_lama)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actualNomor,
          item.brgKode,
          item.satuan,
          item.qty,
          item.discPr || 0,
          item.harga,
          item.keterangan || "",
          index,
          item.brgKodeLama || item.kodeLama || "-",
        ]
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

module.exports = { getCustomerOptions, getBarangOptions, getDetailForm, saveData };
