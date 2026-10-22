const db = require("../../config/database");

// ── Generate Nomor Otomatis ──────────────────────────────────────────
const getMaxNomor = async (tanggal, cabang, tipe) => {
  const d = new Date(tanggal);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${cabang}-${tipe}.${yy}${mm}.`;

  const [[row]] = await db.query(
    `SELECT IFNULL(MAX(CAST(RIGHT(jur_no, 4) AS UNSIGNED)), 0) AS max_val
     FROM tjurnal
     WHERE jur_no LIKE ?`,
    [`${prefix}%`]
  );
  const nextNum = 10000 + Number(row.max_val) + 1;
  return `${prefix}${String(nextNum).slice(-4)}`;
};

// ── Search Account ───────────────────────────────────────────────────
const searchAccount = async (search = "", tipe = "ALL") => {
  const kodePrefix = tipe === "KK" ? "11" : tipe === "BK" ? "12" : null;
  const params = [`%${search}%`, `%${search}%`];
  let where = "rek_isaktif = 1";
  if (kodePrefix) {
    where += " AND rek_kol_id = 1 AND rek_kode LIKE ? ";
    params.unshift(`${kodePrefix}%`);
  }
  const [rows] = await db.query(
    `SELECT rek_kode AS kode, rek_nama AS nama
     FROM trekening
     WHERE ${where}
       AND (rek_nama LIKE ? OR rek_kode LIKE ?)
     ORDER BY rek_nama
     LIMIT 100`,
    params
  );
  return rows;
};

// ── Search Cost Center ───────────────────────────────────────────────
const searchCostCenter = async () => {
  const [rows] = await db.query(
    `SELECT cc_kode AS kode, cc_nama AS nama FROM tcostcenter ORDER BY cc_nama`
  );
  return rows;
};

// ── Search Customer ──────────────────────────────────────────────────
const searchCustomer = async (search = "") => {
  const [rows] = await db.query(
    `SELECT cus_kode AS kode, cus_nama AS nama
     FROM tcustomer
     WHERE cus_nama LIKE ? OR cus_kode LIKE ?
     ORDER BY cus_nama LIMIT 50`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── Search Kendaraan ─────────────────────────────────────────────────
const searchKendaraan = async (search = "") => {
  const [rows] = await db.query(
    `SELECT kend_nopol AS nopol, kend_tipe AS tipe
     FROM tkendaraan
     WHERE kend_nopol LIKE ? OR kend_tipe LIKE ?
     ORDER BY kend_nopol LIMIT 50`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── Search Ekspedisi ─────────────────────────────────────────────────
const searchEkspedisi = async (search = "") => {
  const [rows] = await db.query(
    `SELECT ekspedisi_id AS id, ekspedisi_nama AS nama
     FROM tekspedisi
     WHERE ekspedisi_nama LIKE ? OR ekspedisi_id LIKE ?
     ORDER BY ekspedisi_nama LIMIT 50`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── Cek Biaya ────────────────────────────────────────────────────────
const cekBiaya = async (account) => {
  const [[row]] = await db.query(
    `SELECT
       rek_kol_id,
       rek_status,
       rek_kode
     FROM trekening
     WHERE rek_kode = ?`,
    [account]
  );

  if (!row) {
    return {
      needCostCenter: false,
      needCustomer: false,
      needKendaraan: false,
      needEkspedisi: false,
    };
  }

  return {
    needCostCenter: [12, 13].includes(Number(row.rek_kol_id)),
    needCustomer: Number(row.rek_status) === 1,
    needKendaraan: ["23.025", "23.021", "23.022", "23.039", "23.056"].includes(row.rek_kode),
    needEkspedisi: ["23.008", "23.043", "23.015"].includes(row.rek_kode),
  };
};

// ── Load Form Edit ───────────────────────────────────────────────────
const getDetailForm = async (nomor) => {
  const [[header]] = await db.query(
    `SELECT
        jur_no AS nomor,
        DATE_FORMAT(jur_tanggal, '%Y-%m-%d') AS tanggal,
        IFNULL(jur_keterangan, '') AS keterangan,
        jur_isclosed,
       (SELECT jurd_rek_kode FROM tjurnalitem WHERE jurd_jur_no = ? AND jurd_kredit > 0 LIMIT 1) AS account,
       (SELECT jurd_kredit FROM tjurnalitem WHERE jurd_jur_no = ? AND jurd_kredit > 0 LIMIT 1) AS nilai
     FROM tjurnal
     WHERE jur_no = ?`,
    [nomor, nomor, nomor]
  );

  if (!header) throw new Error("Pembayaran lain tidak ditemukan.");

  const tipe = header.nomor.includes("BK") ? "BK" : "KK";

  const [[namaAccount]] = await db.query(
    `SELECT rek_nama AS nama FROM trekening WHERE rek_kode = ?`,
    [header.account]
  );

  const [detailRows] = await db.query(
    `SELECT
       jurd_rek_kode AS account,
       rek_nama AS accountName,
       jurd_debet AS nilai,
       IFNULL(jurd_keterangan, '') AS memo,
       IFNULL(jurd_cc_kode, '') AS costCenter,
       IFNULL(jurd_cus_kode, '') AS customer,
       IFNULL(jurd_nopol, '') AS kendaraan,
       IFNULL(jurd_kilometer, 0) AS kilometer,
       IFNULL(jurd_ekspedisi, '') AS ekspedisi
     FROM tjurnalitem
     INNER JOIN trekening ON rek_kode = jurd_rek_kode
     WHERE jurd_jur_no = ? AND jurd_debet > 0
     ORDER BY jurd_nourut`,
    [nomor]
  );

  return {
    nomor: header.nomor,
    tanggal: header.tanggal,
    keterangan: header.keterangan,
    nilai: Number(header.nilai),
    account: header.account,
    namaAccount: namaAccount?.nama || "",
    tipe,
    locked: Number(header.jur_isclosed) === 1 ? 1 : 0,
    detail: detailRows.map((d, i) => ({
      no: i + 1,
      account: d.account,
      accountName: d.accountName,
      nilai: Number(d.nilai),
      memo: d.memo,
      costCenter: d.costCenter,
      customer: d.customer,
      kendaraan: d.kendaraan,
      kilometer: Number(d.kilometer),
      ekspedisi: d.ekspedisi,
    })),
  };
};

// ── Cek periode sudah ditutup (paritas Delphi cekTutupPeriode) ────────
const cekTutupPeriode = async (tanggal) => {
  const d = new Date(tanggal);
  const [[row]] = await db.query(
    `SELECT 1 FROM ttutupperiode WHERE TUTUP_BULAN = ? AND TUTUP_TAHUN = ? LIMIT 1`,
    [d.getMonth() + 1, d.getFullYear()]
  );
  return !!row;
};

// ── Save Data ────────────────────────────────────────────────────────
const saveData = async (payload, user) => {
  const {
    isEdit, nomor, tanggal, keterangan, nilai, account, detail, tipe,
  } = payload;

  // Paritas Delphi cxButton1/2Click: blok bila periode sudah ditutup
  if (await cekTutupPeriode(tanggal)) {
    throw new Error("Periode ini sudah di tutup.");
  }

  // Lapis 2: transaksi yang sudah tutup periode tidak boleh diedit
  if (isEdit) {
    const [[hdr]] = await db.query(
      `SELECT jur_isclosed FROM tjurnal WHERE jur_no = ?`,
      [nomor]
    );
    if (hdr && Number(hdr.jur_isclosed) === 1) {
      throw new Error("Transaksi ini sudah tutup Periode,Tidak dapat di edit");
    }
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    let actualNomor = nomor;

    if (isEdit) {
      await conn.query(
        `UPDATE tjurnal SET
           jur_tanggal = ?, jur_keterangan = ?,
           date_modified = NOW(), user_modified = ?
         WHERE jur_no = ?`,
        [tanggal, keterangan, user.kode, nomor]
      );
    } else {
      actualNomor = await getMaxNomor(tanggal, user.cabang, tipe);
      await conn.query(
        `INSERT INTO tjurnal
           (jur_no, jur_tanggal, jur_keterangan, jur_tipetransaksi, date_create, user_create)
         VALUES (?, ?, ?, 'Pembayaran Lain', NOW(), ?)`,
        [actualNomor, tanggal, keterangan, user.kode]
      );
    }

    // Delete detail lama
    await conn.query(
      `DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`,
      [actualNomor]
    );

    // Insert header (kredit)
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_kredit, jurd_debet, jurd_cc_kode, jurd_keterangan, jurd_nourut)
       VALUES (?, ?, ?, 0, '', ?, 0)`,
      [actualNomor, account, nilai, keterangan]
    );

    // Insert detail (debet)
    let nourut = 1;
    for (const d of detail) {
      if (Number(d.nilai) > 0 && d.account) {
        await conn.query(
          `INSERT INTO tjurnalitem
             (jurd_jur_no, jurd_rek_kode, jurd_kredit, jurd_debet, jurd_cc_kode,
              jurd_keterangan, jurd_nourut, jurd_cus_kode)
           VALUES (?, ?, 0, ?, ?, ?, ?, ?)`,
          [
            actualNomor, d.account, d.nilai, d.costCenter,
            d.memo, nourut, d.customer,
          ]
        );
        nourut++;
      }
    }

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = {
  getMaxNomor,
  searchAccount,
  searchCostCenter,
  searchCustomer,
  searchKendaraan,
  searchEkspedisi,
  cekBiaya,
  cekTutupPeriode,
  getDetailForm,
  saveData,
};