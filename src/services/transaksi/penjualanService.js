const db = require("../../config/database");

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
      h.so_nomor AS Nomor,
      DATE_FORMAT(h.so_tanggal, '%Y-%m-%d') AS Tanggal,
      c.cus_nama AS Customer,
      h.so_memo AS Memo,
      IF(h.so_istax = 1 OR h.so_istax = 2, 'Ya', 'Tidak') AS Pajak,
      h.so_amount AS Total,
      h.so_taxamount AS Ppn,
      IF(h.so_isclosed = 1, 'Closed', 'Open') AS Status,
      IF(IFNULL(h.so_status_rec, 0) > 0, 'Sudah', 'Belum') AS Kirim
     FROM tso_hdr h
     LEFT JOIN tcustomer c ON h.so_cus_kode = c.cus_kode
     WHERE h.so_tanggal BETWEEN ? AND ?
     ORDER BY h.so_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

const getBrowseDetail = async (nomor) => {
  const cleanNomor = String(nomor || "").trim();
  const [rows] = await db.query(
    `SELECT
       d.sod_nourut               AS NoUrut,
       d.sod_brg_kode             AS brgKode,
       b.brg_kode                 AS barcode,
       b.brg_nama                 AS brgNama,
       d.sod_brg_satuan           AS satuan,
       d.sod_qty                  AS qty,
       d.sod_harga                AS harga,
       d.sod_discpr               AS discPr,
       IFNULL(d.sod_qty_kirim, 0) AS QtyKirim,
       (d.sod_qty * (d.sod_harga * (100 - IFNULL(d.sod_discpr, 0)) / 100)) AS Subtotal
     FROM tso_dtl d
     LEFT JOIN tbarang b ON d.sod_brg_kode = b.brg_kode
     WHERE TRIM(d.sod_so_nomor) = TRIM(?)
     ORDER BY d.sod_nourut ASC`,
    [cleanNomor]
  );
  return rows;
};

const deleteData = async (nomor) => {
  const [[so]] = await db.query(
    `SELECT so_tanggal, so_isclosed, so_status_rec FROM tso_hdr WHERE so_nomor = ?`,
    [nomor]
  );
  if (!so) throw new Error("Data penjualan tidak ditemukan.");
  if (so.so_isclosed === 1 || so.so_status_rec > 0) {
    throw new Error("Penjualan tidak bisa dihapus karena sudah Closed atau sudah pernah dikirim.");
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(`DELETE FROM tso_dtl WHERE sod_so_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tso_hdr WHERE so_nomor = ?`, [nomor]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const updateStatus = async (nomor, user = "SYSTEM") => {
  const [[so]] = await db.query(
    `SELECT so_isclosed FROM tso_hdr WHERE so_nomor = ?`,
    [nomor]
  );
  if (!so) throw new Error("Data penjualan tidak ditemukan.");

  const newStatus = so.so_isclosed === 1 ? 0 : 1;
  await db.query(
    `UPDATE tso_hdr
     SET so_isclosed = ?, date_modified = NOW(), user_modified = ?
     WHERE so_nomor = ?`,
    [newStatus, user, nomor]
  );
  return { Nomor: nomor, Status: newStatus === 1 ? "Closed" : "Open" };
};

const getPrintData = async (nomor) => {
  const [[header]] = await db.query(
    `
    SELECT
      h.so_nomor AS nomor,
      DATE_FORMAT(h.so_tanggal, '%d/%m/%Y') AS tanggal,
      IFNULL(h.so_memo, '') AS memo,
      IFNULL(h.so_amount, 0) AS amount,
      IFNULL(h.so_taxamount, 0) AS taxamount,
      0 AS dp,
      IFNULL(h.so_disc_faktur, 0) AS disc_faktur,
      IFNULL(h.so_disc_fakturpr, 0) AS disc_fakturpr,
      IFNULL(c.cus_nama, '') AS cus_nama,
      IFNULL(c.cus_alamat, '') AS cus_alamat,
      IFNULL(c.cus_telp, '') AS cus_telp
    FROM tso_hdr h
    LEFT JOIN tcustomer c ON c.cus_kode = h.so_cus_kode
    WHERE h.so_nomor = ?
    `,
    [nomor]
  );
  if (!header) throw new Error("Data penjualan tidak ditemukan.");

  const [detail] = await db.query(
    `
    SELECT
      d.sod_nourut AS nourut,
      d.sod_brg_kode AS kode,
      IFNULL(b.brg_nama, '') AS nama,
      IFNULL(d.sod_brg_satuan, '') AS satuan,
      IFNULL(d.sod_qty, 0) AS qty,
      IFNULL(d.sod_harga, 0) AS harga,
      IFNULL(d.sod_discpr, 0) AS discpr
    FROM tso_dtl d
    LEFT JOIN tbarang b ON b.brg_kode = d.sod_brg_kode
    WHERE d.sod_so_nomor = ?
    ORDER BY d.sod_nourut ASC
    `,
    [nomor]
  );

  const [[perusahaan]] = await db.query(
    `SELECT perush_nama, perush_alamat, perush_kota, perush_NOtelp
     FROM tperusahaan LIMIT 1`
  );

  const amount = Number(header.amount);
  const taxamount = Number(header.taxamount);
  const discFakturPr = Number(header.disc_fakturpr);
  const discFaktur = Number(header.disc_faktur);
  const nilai = amount - taxamount;

  return {
    nomor: header.nomor,
    tanggal: header.tanggal,
    memo: header.memo,
    amount,
    taxamount,
    dp: 0,
    discFaktur,
    nilai,
    total: amount,
    cus_nama: header.cus_nama,
    cus_alamat: header.cus_alamat,
    cus_telp: header.cus_telp,
    perusahaan: perusahaan
      ? {
          nama: perusahaan.perush_nama,
          alamat: perusahaan.perush_alamat,
          kota: perusahaan.perush_kota,
          notelp: perusahaan.perush_NOtelp,
        }
      : { nama: "", alamat: "", kota: "", notelp: "" },
    detail,
  };
};

module.exports = { getBrowse, getBrowseDetail, deleteData, updateStatus, getPrintData };
