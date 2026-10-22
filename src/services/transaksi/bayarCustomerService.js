const db = require("../../config/database");
const dbMm = require("../../config/databaseMinimarket");
const { cekTutupPeriode } = require("../tutupBukuService");

// ── Nomor otomatis: {CABANG}-CR.{yymm}.{urut4}  cth: 01-CR.2609.0001 ──
// (porting getmaxkode ufrmBayarCustomer, NOMERATOR = 'CR')
const generateNomorBukti = async (cabang, tanggal) => {
  const d = tanggal ? new Date(tanggal) : new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${cabang || "01"}-CR.${yy}${mm}.`;

  const [[row]] = await dbMm.query(
    `SELECT IFNULL(MAX(CAST(RIGHT(byc_nomor, 4) AS UNSIGNED)), 0) AS max_val
     FROM minimarket.tbayarcus_hdr WHERE byc_nomor LIKE ?`,
    [`${prefix}%`],
  );
  const nextNum = 10000 + Number(row.max_val) + 1;
  return `${prefix}${String(nextNum).slice(-4)}`;
};

// ── Cari customer (kode/nama) + alamat ──
const searchCustomer = async (search) => {
  const [rows] = await dbMm.query(
    `SELECT Cus_kode AS kode, Cus_nama AS nama,
            IFNULL(Cus_alamat, '') AS alamat,
            IFNULL(Cus_telp, '') AS telp
     FROM minimarket.tcustomer
     WHERE Cus_kode LIKE ? OR Cus_nama LIKE ?
     ORDER BY Cus_nama LIMIT 50`,
    [`%${search || ""}%`, `%${search || ""}%`],
  );
  return rows;
};

// ── Kas/Bank (akun KONVEKSI — kode dipakai langsung di jurnal) ──
const getRekeningOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT REK_KODE AS kode, REK_NAMA AS nama
     FROM trekening
     WHERE (REK_KODE LIKE '11.%' OR REK_KODE LIKE '12.%')
       AND (REK_NAMA LIKE ? OR REK_KODE LIKE ?)
     ORDER BY REK_KODE LIMIT 30`,
    [`%${search}%`, `%${search}%`],
  );
  return rows;
};

// ── Invoice piutang belum lunas saat customer dipilih ──
// (porting loaddataInvoice: so_amount+so_ongkir sebagai piutang,
//  IFNULL(so_bayar,0) sebagai terbayar, hanya yang masih bersisa)
const getInvoicePiutang = async (cusKode) => {
  const [rows] = await dbMm.query(
    `SELECT
       so_nomor AS invoiceNomor,
       DATE_FORMAT(so_tanggal, '%Y-%m-%d') AS invoiceTanggal,
       (IFNULL(so_amount, 0) + IFNULL(so_ongkir, 0)) AS invoiceNetto,
       (IFNULL(so_amount, 0) + IFNULL(so_ongkir, 0) - IFNULL(so_bayar, 0)) AS sisaPiutang,
       0 AS nilaiBayar,
       0 AS isChecked
     FROM minimarket.tso_hdr
     WHERE so_cus_kode = ?
       AND IFNULL(so_piutang, 0) > 0
     HAVING sisaPiutang > 0
     ORDER BY so_tanggal ASC`,
    [cusKode],
  );
  return rows;
};

// ── Riwayat pembayaran (porting SQLMaster ufrmBrowseBayarCustomer) ──
const getAllHistory = async (startDate, endDate) => {
  let sql = `
    SELECT
      h.byc_nomor AS NOMOR,
      DATE_FORMAT(h.byc_tanggal, '%Y-%m-%d') AS TANGGAL,
      h.byc_cus_kode AS CUS_KODE,
      c.Cus_nama AS CUS_NAMA,
      h.byc_nilai AS TOTAL_BAYAR,
      h.byc_rek_kode AS REK_KODE,
      IFNULL(h.byc_memo, '') AS MEMO,
      IFNULL(h.byc_istax, 0) AS ISTAX,
      IFNULL(h.isposting, 0) AS POSTING,
      IFNULL(h.noposting, 0) AS NOPOSTING,
      DATE_FORMAT((SELECT s.tanggal FROM minimarket.tsetoran s WHERE s.nomor = h.noposting LIMIT 1), '%Y-%m-%d') AS TGL_POSTING
    FROM minimarket.tbayarcus_hdr h
    LEFT JOIN minimarket.tcustomer c ON c.Cus_kode = h.byc_cus_kode`;
  const params = [];
  if (startDate && endDate) {
    // DATE() agar perbandingan murni tanggal — abaikan komponen jam bila ada
    sql += ` WHERE DATE(h.byc_tanggal) BETWEEN DATE(?) AND DATE(?)`;
    params.push(startDate, endDate);
  }
  sql += ` ORDER BY h.byc_nomor DESC`;
  const [rows] = await dbMm.query(sql, params);
  // REK_NAMA dari trekening KONVEKSI (kode rekening menyimpan akun konveksi)
  if (rows.length) {
    const [kv] = await db.query(
      `SELECT REK_KODE, REK_NAMA FROM trekening
       WHERE REK_KODE LIKE '11.%' OR REK_KODE LIKE '12.%'`,
    );
    const mapKV = new Map(kv.map((x) => [x.REK_KODE, x.REK_NAMA]));
    rows.forEach((x) => {
      x.REK_NAMA = mapKV.get(x.REK_KODE) || "";
    });
  }
  return rows;
};

// ── Detail nota untuk expand di browse ──
const getDetail = async (nomor) => {
  const [rows] = await dbMm.query(
    `SELECT
       d.bycd_fp_nomor AS NoInvoice,
       DATE_FORMAT(i.so_tanggal, '%Y-%m-%d') AS TglInvoice,
       (IFNULL(i.so_amount, 0) + IFNULL(i.so_ongkir, 0)) AS TotalInvoice,
       d.bycd_bayar AS NilaiBayar
     FROM minimarket.tbayarcus_dtl d
     LEFT JOIN minimarket.tso_hdr i ON d.bycd_fp_nomor = i.so_nomor
     WHERE d.bycd_byc_nomor = ?
     ORDER BY d.bycd_fp_nomor ASC`,
    [nomor],
  );
  return rows;
};

// ── Load form edit: header + daftar invoice (yang dibayar nota ini + yang masih bersisa) ──
const getDetailForm = async (nomor) => {
  const [[h]] = await dbMm.query(
    `SELECT
       h.byc_nomor AS nomorBukti,
       DATE_FORMAT(h.byc_tanggal, '%Y-%m-%d') AS tanggal,
       h.byc_cus_kode AS cusKode,
       c.Cus_nama AS cusNama,
       IFNULL(c.Cus_alamat, '') AS cusAlamat,
       h.byc_rek_kode AS rekKode,
       IFNULL(h.byc_memo, '') AS catatan,
       IFNULL(h.byc_istax, 0) AS isPajak,
       h.byc_nilai AS totalBayar,
       IFNULL(h.isposting, 0) AS isposting
      FROM minimarket.tbayarcus_hdr h
      LEFT JOIN minimarket.tcustomer c ON c.Cus_kode = h.byc_cus_kode
      WHERE h.byc_nomor = ?`,
    [nomor],
  );
  if (!h) throw new Error("Data pembayaran tidak ditemukan.");
  // rekNama ditarik dari trekening KONVEKSI
  const [[kas]] = await db.query(
    `SELECT REK_NAMA FROM trekening WHERE REK_KODE = ?`,
    [h.rekKode],
  );
  h.rekNama = kas?.REK_NAMA || "";

  const [invoices] = await dbMm.query(
    `SELECT
       inv.so_nomor AS invoiceNomor,
       DATE_FORMAT(inv.so_tanggal, '%Y-%m-%d') AS invoiceTanggal,
       (IFNULL(inv.so_amount, 0) + IFNULL(inv.so_ongkir, 0)) AS invoiceNetto,
       -- sisa SEBELUM nota ini (kembalikan dulu yang dibayar nota ini)
       (IFNULL(inv.so_amount, 0) + IFNULL(inv.so_ongkir, 0)
         - IFNULL(inv.so_bayar, 0) + IFNULL(d.bycd_bayar, 0)) AS sisaPiutang,
       IFNULL(d.bycd_bayar, 0) AS nilaiBayar,
       IF(d.bycd_fp_nomor IS NOT NULL, 1, 0) AS isChecked
     FROM minimarket.tso_hdr inv
     LEFT JOIN minimarket.tbayarcus_dtl d
       ON d.bycd_fp_nomor = inv.so_nomor AND d.bycd_byc_nomor = ?
     WHERE inv.so_cus_kode = ?
       AND (
         d.bycd_fp_nomor IS NOT NULL
         OR (IFNULL(inv.so_amount, 0) + IFNULL(inv.so_ongkir, 0) - IFNULL(inv.so_bayar, 0)) > 0
       )
     ORDER BY inv.so_tanggal ASC`,
    [nomor, h.cusKode],
  );

  return { ...h, listInvoice: invoices };
};

// ── Jurnal otomatis di konveksi: debet Kas/Bank pilihan, kredit Piutang Dagang ──
// jur_no = nomor bukti pembayaran, DELETE-INSERT agar idempotent (insert & edit)
const buatJurnal = async (header, totalBayar, user) => {
  if (!header.rekKode) throw new Error("Rekening kas/bank belum dipilih.");

  const [[kas]] = await db.query(
    `SELECT REK_KODE, REK_NAMA FROM trekening WHERE REK_KODE = ?`,
    [header.rekKode],
  );
  if (!kas)
    throw new Error(
      `Rekening ${header.rekKode} tidak ada di master akun konveksi.`,
    );

  const [[piutang]] = await db.query(
    `SELECT REK_KODE FROM trekening WHERE TRIM(UPPER(REK_NAMA)) = 'PIUTANG DAGANG' LIMIT 1`,
  );
  if (!piutang)
    throw new Error(
      "Akun 'PIUTANG DAGANG' tidak ditemukan di master akun konveksi.",
    );

  const keterangan =
    header.catatan || `Pembayaran ${header.cusNama || header.cusKode}`;

  await db.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [
    header.nomorBukti,
  ]);
  await db.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [header.nomorBukti]);

  await db.query(
    `INSERT INTO tjurnal
       (jur_no, jur_tanggal, jur_keterangan, jur_tipetransaksi,
        jur_isclosed, date_create, user_create)
     VALUES (?, ?, ?, 'Pembayaran Customer', 0, NOW(), ?)`,
    [header.nomorBukti, header.tanggal, keterangan, user?.kode || "ADMIN"],
  );

  // Debet: Kas/Bank yang dipilih — nourut mulai 1 (baris 0 = header JU,
  // dikecualikan laporan neraca/labarugi)
  await db.query(
    `INSERT INTO tjurnalitem
       (jurd_jur_no, jurd_rek_kode, jurd_kredit, jurd_debet, jurd_nourut, jurd_keterangan)
     VALUES (?, ?, 0, ?, 1, ?)`,
    [header.nomorBukti, kas.REK_KODE, totalBayar, keterangan],
  );

  // Kredit: Piutang Dagang (per customer)
  await db.query(
    `INSERT INTO tjurnalitem
       (jurd_jur_no, jurd_rek_kode, jurd_kredit, jurd_debet, jurd_nourut, jurd_cus_kode, jurd_keterangan)
     VALUES (?, ?, ?, 0, 2, ?, ?)`,
    [header.nomorBukti, piutang.REK_KODE, totalBayar, header.cusKode, keterangan],
  );
};

// ── Simpan (insert / update).
// so_bayar di tso_hdr dirawat OTOMATIS oleh trigger DB:
//   tbayarcus_dtl_before_insert / tbayarcus_dtl_before_delete
// sehingga service ini TIDAK boleh update so_bayar manual (double counting).
const saveData = async (payload, user) => {
  const { header, totalBayar, details } = payload;

  const tutup = await cekTutupPeriode(header.tanggal);
  if (tutup) throw new Error("Periode sudah ditutup. Tidak bisa disimpan.");

  const conn = await dbMm.getConnection();
  await conn.beginTransaction();
  try {
    const now = new Date();
    const kodeUser = user?.kode || "ADMIN";

    if (header.isEdit) {
      const nomorBukti = header.nomorBukti;

      const [[cur]] = await conn.query(
        `SELECT IFNULL(isposting, 0) AS isposting
         FROM minimarket.tbayarcus_hdr WHERE byc_nomor = ?`,
        [nomorBukti],
      );
      if (!cur) throw new Error("Data pembayaran tidak ditemukan.");
      if (Number(cur.isposting) === 1)
        throw new Error("Transaksi ini sudah Posting, tidak dapat diubah.");

      // Hapus detail lama — trigger before_delete mengembalikan so_bayar
      await conn.query(
        `DELETE FROM minimarket.tbayarcus_dtl WHERE bycd_byc_nomor = ?`,
        [nomorBukti],
      );

      await conn.query(
        `UPDATE minimarket.tbayarcus_hdr
         SET byc_tanggal = ?, byc_cus_kode = ?, byc_rek_kode = ?,
             byc_nilai = ?, byc_memo = ?, byc_istax = ?,
             date_modified = ?, user_modified = ?
         WHERE byc_nomor = ?`,
        [
          header.tanggal,
          header.cusKode,
          header.rekKode,
          totalBayar,
          header.catatan || "",
          header.isPajak ? 1 : 0,
          now,
          kodeUser,
          nomorBukti,
        ],
      );
    } else {
      // ── INSERT baru, nomor selalu digenerate ulang ala Delphi ──
      const nomorBukti = await generateNomorBukti(
        user?.cabang || "01",
        header.tanggal,
      );
      await conn.query(
        `INSERT INTO minimarket.tbayarcus_hdr
           (byc_nomor, byc_tanggal, byc_cus_kode, byc_rek_kode,
            byc_nilai, byc_memo, byc_istax, date_create, user_create)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nomorBukti,
          header.tanggal,
          header.cusKode,
          header.rekKode,
          totalBayar,
          header.catatan || "",
          header.isPajak ? 1 : 0,
          now,
          kodeUser,
        ],
      );
      header.nomorBukti = nomorBukti;
    }

    // ── Insert detail baru — trigger before_insert menambah so_bayar ──
    for (const dt of details) {
      await conn.query(
        `INSERT INTO minimarket.tbayarcus_dtl
           (bycd_byc_nomor, bycd_fp_nomor, bycd_bayar)
         VALUES (?, ?, ?)`,
        [header.nomorBukti, dt.invoiceNomor, dt.nilaiBayar],
      );
    }

    await conn.commit();

    // Jurnal konveksi dibuat SETELAH commit minimarket
    // (server DB berbeda — tidak bisa satu transaksi)
    let journalError = null;
    try {
      await buatJurnal(header, totalBayar, user);
    } catch (je) {
      console.error("[bayarCustomer] Jurnal gagal dibuat:", je.message);
      journalError = je.message;
    }

    return { nomor: header.nomorBukti, journalError };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Hapus transaksi (kembalikan so_bayar via trigger before_delete) ──
const deleteTransaksi = async (nomorBukti) => {
  const [[cur]] = await dbMm.query(
    `SELECT byc_tanggal, IFNULL(isposting, 0) AS isposting
     FROM minimarket.tbayarcus_hdr WHERE byc_nomor = ?`,
    [nomorBukti],
  );
  if (!cur) throw new Error("Data pembayaran tidak ditemukan.");
  if (Number(cur.isposting) === 1)
    throw new Error("Transaksi ini sudah Posting, tidak dapat dihapus.");

  const tutup = await cekTutupPeriode(cur.byc_tanggal);
  if (tutup) throw new Error("Periode sudah ditutup. Tidak bisa dihapus.");

  const conn = await dbMm.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(
      `DELETE FROM minimarket.tbayarcus_dtl WHERE bycd_byc_nomor = ?`,
      [nomorBukti],
    );
    await conn.query(`DELETE FROM minimarket.tbayarcus_hdr WHERE byc_nomor = ?`, [
      nomorBukti,
    ]);
    await conn.commit();

    // Ikutkan hapus jurnal konveksi dengan jur_no = nomor bukti
    try {
      await db.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [
        nomorBukti,
      ]);
      await db.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomorBukti]);
    } catch (je) {
      console.error("[bayarCustomer] Jurnal gagal dihapus:", je.message);
    }

    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = {
  generateNomorBukti,
  searchCustomer,
  getRekeningOptions,
  getInvoicePiutang,
  getAllHistory,
  getDetail,
  getDetailForm,
  saveData,
  deleteTransaksi,
  buatJurnal,
};
