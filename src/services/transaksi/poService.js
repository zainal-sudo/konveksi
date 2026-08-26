const db = require("../../config/database");

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT 
      h.po_nomor AS Nomor,
      DATE_FORMAT(h.po_tanggal, '%Y-%m-%d') AS Tanggal,
      s.sup_nama AS Supplier,
      h.po_memo AS Memo,
      IF(h.po_istax = 1, 'Ya', 'Tidak') AS Pajak,
      h.po_amount AS Total,
      h.po_taxamount AS Ppn,
      IF(h.po_isclosed = 1, 'Closed', 'Open') AS Status,
      IF(h.po_status_rec > 0, 'Sudah', 'Belum') AS Receipt
     FROM tpo_hdr h
     LEFT JOIN tsupplier s ON h.po_sup_kode = s.sup_kode
     WHERE h.po_tanggal BETWEEN ? AND ?
     ORDER BY h.po_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

// Dipanggil dari controller.getBrowseDetail -> poApi.getDetail(nomor) di frontend.
// TRIM() ditambahkan di kedua sisi supaya kebal terhadap kemungkinan
// whitespace tersembunyi di kolom po_nomor / pod_po_nomor.
//
// Item PO sekarang dari tbarang (bahan sudah digabung ke tbarang).
const getBrowseDetail = async (nomor) => {
  const cleanNomor = String(nomor || "").trim();

  const [rows] = await db.query(
    `SELECT
       d.pod_nourut               AS NoUrut,
       d.pod_brg_kode              AS brgKode,
       b.brg_kode                  AS barcode,
       b.brg_nama                  AS brgNama,
       d.pod_brg_satuan            AS satuan,
       d.pod_qty                   AS qty,
       d.pod_harga                 AS harga,
       d.pod_discpr                AS discPr,
       IFNULL(d.pod_qty_terima, 0) AS QtyTerima
     FROM tpo_dtl d
     LEFT JOIN tbarang b ON TRIM(d.pod_brg_kode) = TRIM(b.brg_kode)
     WHERE TRIM(d.pod_po_nomor) = TRIM(?)
     ORDER BY d.pod_nourut ASC`,
    [cleanNomor]
  );

  // Debug sementara — hapus/comment lagi kalau sudah fix, biar log gak berisik
  console.log(`[PO getBrowseDetail] nomor="${cleanNomor}" -> ${rows.length} baris`);

  return rows;
};


const deleteData = async (nomor) => {
  const [[po]] = await db.query(
    `SELECT po_tanggal, po_isclosed, po_status_rec FROM tpo_hdr WHERE po_nomor = ?`,
    [nomor]
  );
  if (!po) throw new Error("Data PO tidak ditemukan.");
  if (po.po_isclosed === 1 || po.po_status_rec > 0) {
    throw new Error("PO tidak bisa dihapus karena sudah di-Closed atau barang sudah pernah diterima.");
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(`DELETE FROM tpo_dtl WHERE pod_po_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tpo_hdr WHERE po_nomor = ?`, [nomor]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const updateStatus = async (nomor, user = "SYSTEM") => {
  const [[po]] = await db.query(
    `SELECT po_isclosed, po_status_rec FROM tpo_hdr WHERE po_nomor = ?`,
    [nomor]
  );
  if (!po) throw new Error("Data PO tidak ditemukan.");

  const newStatus = po.po_isclosed === 1 ? 0 : 1;

  await db.query(
    `UPDATE tpo_hdr 
     SET po_isclosed = ?, date_modified = NOW(), user_modified = ?
     WHERE po_nomor = ?`,
    [newStatus, user, nomor]
  );

  return { Nomor: nomor, Status: newStatus === 1 ? "Closed" : "Open" };
};

// ── Data print (slip PO) ──────────────────────────────────────────────
const getPrintData = async (nomor) => {
  // 1. Header PO + Supplier
  const [[header]] = await db.query(
    `
    SELECT
      h.po_nomor          AS nomor,
      DATE_FORMAT(h.po_tanggal, '%d/%m/%Y') AS tanggal,
      IFNULL(h.po_memo, '') AS memo,
      IFNULL(h.po_amount, 0) AS amount,
      IFNULL(h.po_taxamount, 0) AS taxamount,
      0 AS dp,
      IFNULL(h.po_disc_faktur, 0) AS disc_faktur,
      IFNULL(h.po_disc_fakturpr, 0) AS disc_fakturpr,
      IFNULL(s.sup_nama, '') AS sup_nama,
      IFNULL(s.sup_alamat, '') AS sup_alamat,
      IFNULL(s.sup_telp, '') AS sup_telp,
      IFNULL(s.sup_fax, '') AS sup_fax
    FROM tpo_hdr h
    INNER JOIN tsupplier s ON s.sup_kode = h.po_sup_kode
    WHERE h.po_nomor = ?
    `,
    [nomor]
  );
  if (!header) throw new Error("Data PO tidak ditemukan.");

  // 2. Detail items PO
  const [detail] = await db.query(
    `
    SELECT
      d.pod_nourut      AS nourut,
      d.pod_brg_kode    AS kode,
      IFNULL(b.brg_nama, '') AS nama,
      IFNULL(d.pod_brg_satuan, '') AS satuan,
      IFNULL(d.pod_qty, 0) AS qty,
      IFNULL(d.pod_harga, 0) AS harga,
      IFNULL(d.pod_discpr, 0) AS discpr
    FROM tpo_dtl d
    INNER JOIN tbarang b ON b.brg_kode = d.pod_brg_kode
    WHERE d.pod_po_nomor = ?
    ORDER BY d.pod_nourut ASC
    `,
    [nomor]
  );

  // 3. Company info
  const [[perusahaan]] = await db.query(
    `SELECT perush_nama, perush_alamat, perush_kota, perush_NOtelp
     FROM tperusahaan LIMIT 1`
  );

  // 4. Hitung nilai & total
  const amount = Number(header.amount);
  const taxamount = Number(header.taxamount);
  const dp = Number(header.dp);
  const discFakturPr = Number(header.disc_fakturpr);

  const nett = discFakturPr > 0
    ? ((amount - taxamount) + Number(header.disc_faktur)) / (100 - discFakturPr) * 100
    : amount - taxamount;

  const discFaktur = (discFakturPr * nett) / 100 + Number(header.disc_faktur);
  const nilai = amount - taxamount;

  return {
    nomor: header.nomor,
    tanggal: header.tanggal,
    memo: header.memo,
    amount,
    taxamount,
    dp,
    discFaktur,
    nilai,
    total: amount,
    sup_nama: header.sup_nama,
    sup_alamat: header.sup_alamat,
    sup_telp: header.sup_telp,
    sup_fax: header.sup_fax,
    perusahaan: perusahaan ? {
      nama: perusahaan.perush_nama,
      alamat: perusahaan.perush_alamat,
      kota: perusahaan.perush_kota,
      notelp: perusahaan.perush_NOtelp,
    } : { nama: '', alamat: '', kota: '', notelp: '' },
    detail,
  };
};

const getBarisSlip = async (nama) => {
  const [[row]] = await db.query(
    `SELECT baris FROM barisslip WHERE Nama = ? LIMIT 1`,
    [nama]
  );
  return row ? Number(row.baris) : 20; // default 20 baris kalau tidak ada setting
};

module.exports = { getBrowse, getBrowseDetail, deleteData, updateStatus, getPrintData,getBarisSlip };