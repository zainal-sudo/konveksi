const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

// ── Lookup account header (KAS sesuai cabang) ─────────────────────────
const getAccountOptions = async (cabang) => {
  let where = `LEFT(rek_kode,5)='A-111'`;
  if (cabang === "P02" || cabang === "P04")
    where += ` AND rek_cabang = '${cabang}'`;
  else where += ` AND rek_cabang = 'P01'`;

  const [rows] = await db.query(
    `SELECT rek_kode AS kode, rek_nama AS nama, rek_cabang AS cabang
     FROM trekening WHERE ${where} ORDER BY rek_kode`,
  );
  return rows;
};

// ── Lookup account detail (semua) ─────────────────────────────────────
const getAccountAll = async () => {
  const [rows] = await db.query(
    `SELECT rek_kode AS kode, rek_nama AS nama, rek_cabang AS cabang
     FROM trekening WHERE rek_isaktif = 0 ORDER BY rek_kode`,
  );
  return rows;
};

// ── Lookup keterangan (tjenisbayar) ───────────────────────────────────
const getKeteranganOptions = async () => {
  const [rows] = await db.query(
    `SELECT jenisbayar AS nama FROM tjenisbayar ORDER BY jenisbayar`,
  );
  return rows;
};

// ── Lookup cost center ────────────────────────────────────────────────
const getCostCenterOptions = async () => {
  const [rows] = await db.query(
    `SELECT cc_kode AS kode, cc_nama AS nama FROM tcostcenter ORDER BY cc_nama`,
  );
  return rows;
};

// ── Lookup detail CC ──────────────────────────────────────────────────
const getDcOptions = async (cckode) => {
  const [rows] = await db.query(
    `SELECT dc_kode AS kode, dc_nama AS nama
     FROM tcostcenteritem WHERE dc_kode = ? ORDER BY dc_nama`,
    [cckode],
  );
  return rows;
};

// ── Generate nomor otomatis BKK ───────────────────────────────────────
const getMaxNomor = async (cabang, conn) => {
  const prefix = `${cabang}-BKK.${new Date().getFullYear()}.`;
  const [[row]] = await (conn || db).query(
    `SELECT IFNULL(MAX(CAST(RIGHT(jur_no,5) AS UNSIGNED)),0) AS max_val
     FROM tjurnal WHERE jur_no LIKE ?`,
    [`${prefix}%`],
  );
  return `${prefix}${String(Number(row.max_val) + 1).padStart(5, "0")}`;
};

// ── Nomor otomatis BKM/BBM ────────────────────────────────────────────
const getNomorOtomatis = async (bkkNomor, localNn, conn) => {
  const [[row]] = await (conn || db).query(
    `SELECT IFNULL(MAX(CAST(LEFT(jur_no,2) AS UNSIGNED)),0) AS max_val
     FROM tjurnal WHERE jur_otomatis=1 AND MID(jur_no,3,18)=?`,
    [bkkNomor],
  );
  return String(100 + localNn + Number(row.max_val)).slice(-2) + bkkNomor;
};

// ── Load form edit ────────────────────────────────────────────────────
const getDetailForm = async (nomor) => {
  // Load header + detail sekaligus
  const [rows] = await db.query(
    `
    SELECT h.jur_no, DATE_FORMAT(h.jur_tanggal,'%Y-%m-%d') AS jur_tanggal,
      h.jur_rek_kode, h.jur_penerima, h.jur_nota, h.jur_cabang,
      h.jur_keterangan,
      (SELECT e.rek_nama FROM trekening e WHERE e.rek_kode=h.jur_rek_kode) AS reknama,
      d.jurd_nourut, d.jurd_trs, d.jurd_rek_kode AS det_rek_kode,
      d.jurd_uraian, d.jurd_debet,
      r.rek_nama AS det_reknama,
      d.jurd_cc_kode, c.cc_nama,
      d.jurd_dcnama
    FROM tjurnal h
    LEFT JOIN tjurnalitem d ON d.jurd_jur_no = h.jur_no
    LEFT JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
    LEFT JOIN tcostcenter c ON c.cc_kode = d.jurd_cc_kode
    WHERE d.jurd_trs = 'BKK' AND h.jur_no = ?
    ORDER BY d.jurd_nourut
  `,
    [nomor],
  );

  if (rows.length === 0) throw new Error("Nomor BKK tersebut belum ada.");

  const h = rows[0];
  const detail = rows
    .filter((r) => r.jurd_uraian)
    .map((r) => ({
      no: r.jurd_nourut,
      uraian: r.jurd_uraian,
      nominal: Number(r.jurd_debet),
      rekkode: r.det_rek_kode || "",
      reknama: r.det_reknama || "",
      cckode: r.jurd_cc_kode || 0,
      ccnama: r.cc_nama || "",
      dcnama: r.jurd_dcnama || "",
      dckode: r.jurd_cc_kode || 0,
    }));

  return {
    nomor: h.jur_no,
    tanggal: h.jur_tanggal,
    rek_kode: h.jur_rek_kode,
    rek_nama: h.reknama || "",
    penerima: h.jur_penerima || "",
    nota: h.jur_nota || "",
    keterangan: h.jur_keterangan || "",
    cabang: h.jur_cabang,
    cabang_old: h.jur_cabang,
    detail,
  };
};

// ── Simpan ────────────────────────────────────────────────────────────
const saveData = async (payload, user) => {
  const {
    isEdit,
    nomor,
    tanggal,
    rek_kode,
    penerima,
    nota,
    keterangan,
    cabang,
    cabang_old,
    detail,
  } = payload;

  // Cek tutup periode
  const tutup = await cekTutupPeriode(tanggal);
  if (tutup) throw new Error("Periode sudah ditutup. Tidak bisa disimpan.");

  // Cek cabang beda (hanya untuk non-P01)
  if (isEdit && cabang !== cabang_old && cabang !== "P01") {
    // Delphi: cek user aktif di cabang berbeda
    // Validasi ini di controller level via user.cabang
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();
  let localNn = 0; // reset counter otomatis per transaksi
  let lockKey = null;

  try {
    let actualNomor = nomor;
    let flagEdit = isEdit;

    // Delphi: jika edit dan cabang berubah → delete lalu insert baru
    if (isEdit && cabang !== cabang_old) {
      await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomor]);
      flagEdit = false;
    }

    // Kunci atomik nomor BKK per cabang+tahun supaya 2 request/klik ganda
    // yang hampir bersamaan tidak baca MAX yang sama (race condition).
    if (!flagEdit) {
      lockKey = `nomor_bkk_${cabang}_${new Date().getFullYear()}`;
      await acquireLock(conn, lockKey);
    }

    if (flagEdit) {
      // UPDATE header
      await conn.query(
        `
        UPDATE tjurnal SET
          jur_rek_kode   = ?,
          jur_penerima   = ?,
          jur_nota       = ?,
          jur_keterangan = ?,
          jur_tanggal    = ?,
          date_modified  = NOW(),
          user_modified  = ?
        WHERE jur_no = ?
      `,
        [
          rek_kode,
          penerima || "",
          nota || "",
          keterangan || "",
          tanggal,
          user.kode,
          nomor,
        ],
      );
    } else {
      // INSERT header baru
      actualNomor = await getMaxNomor(cabang, conn);
      await conn.query(
        `
        INSERT INTO tjurnal
          (jur_no, jur_tanggal, jur_tipetransaksi, jur_cabang,
           jur_nota, jur_penerima, jur_keterangan, jur_rek_kode,
           date_create, user_create)
        VALUES (?, ?, 'BKK', ?, ?, ?, ?, ?, NOW(), ?)
      `,
        [
          actualNomor,
          tanggal,
          cabang,
          nota || "",
          penerima || "",
          keterangan || "",
          rek_kode,
          user.kode,
        ],
      );
    }

    // Delphi: delete jurnal otomatis dulu
    await conn.query(
      `DELETE FROM tjurnal WHERE jur_otomatis=1 AND MID(jur_no,3,18)=?`,
      [actualNomor],
    );

    // Delphi: delete semua tjurnalitem dulu
    await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no=?`, [
      actualNomor,
    ]);

    // Hitung total
    const total = detail.reduce((s, d) => s + (Number(d.nominal) || 0), 0);

    // Insert kredit header di tjurnalitem
    await conn.query(
      `
      INSERT INTO tjurnalitem (jurd_jur_no, jurd_rek_kode, jurd_kredit, jurd_uraian)
      VALUES (?, ?, ?, ?)
    `,
      [actualNomor, rek_kode, total, keterangan || ""],
    );

    // Insert debet per baris detail
    let i = 1;
    for (const d of detail) {
      if (!d.uraian) {
        i++;
        continue;
      }

      await conn.query(
        `
        INSERT INTO tjurnalitem
          (jurd_jur_no, jurd_trs, jurd_nourut, jurd_uraian,
           jurd_debet, jurd_rek_kode, jurd_cc_kode, jurd_dcnama)
        VALUES (?, 'BKK', ?, ?, ?, ?, ?, ?)
      `,
        [
          actualNomor,
          i,
          d.uraian,
          Number(d.nominal),
          d.rekkode || "",
          d.cckode || 0,
          d.dcnama || "",
        ],
      );

      // Delphi: BKM otomatis jika account A-111
      if ((d.rekkode || "").startsWith("A-111")) {
        localNn++;
        const noBkm = await getNomorOtomatis(actualNomor, localNn, conn);
        await conn.query(
          `
          INSERT INTO tjurnal
            (jur_no, jur_tanggal, jur_tipetransaksi, jur_cabang,
             jur_penerima, jur_keterangan, jur_rek_kode,
             jur_otomatis, date_create, user_create)
          VALUES (?, ?, 'BKM', ?, ?, ?, ?, 1, NOW(), ?)
        `,
          [
            noBkm,
            tanggal,
            cabang,
            penerima || "",
            `BKM OTOMATIS: ${d.uraian}`,
            d.rekkode,
            user.kode,
          ],
        );
        // Debet
        await conn.query(
          `INSERT INTO tjurnalitem (jurd_jur_no, jurd_rek_kode, jurd_debet, jurd_uraian)
           VALUES (?, ?, ?, ?)`,
          [noBkm, d.rekkode, d.nominal, d.uraian],
        );
        // Kredit
        await conn.query(
          `INSERT INTO tjurnalitem (jurd_jur_no, jurd_trs, jurd_nourut, jurd_uraian, jurd_kredit, jurd_rek_kode)
           VALUES (?, 'BKM', 1, ?, ?, ?)`,
          [noBkm, keterangan || "", d.nominal, rek_kode],
        );
      }

      // Delphi: BBM otomatis jika account A-112 atau B-211
      if (
        (d.rekkode || "").startsWith("A-112") ||
        (d.rekkode || "").startsWith("B-211")
      ) {
        localNn++;
        const noBbm = await getNomorOtomatis(actualNomor, localNn, conn);
        await conn.query(
          `
          INSERT INTO tjurnal
            (jur_no, jur_tanggal, jur_tipetransaksi, jur_cabang,
             jur_penerima, jur_keterangan, jur_rek_kode,
             jur_otomatis, date_create, user_create)
          VALUES (?, ?, 'BBM', ?, ?, ?, ?, 1, NOW(), ?)
        `,
          [
            noBbm,
            tanggal,
            cabang,
            penerima || "",
            `BBM OTOMATIS: ${d.uraian}`,
            d.rekkode,
            user.kode,
          ],
        );
        await conn.query(
          `INSERT INTO tjurnalitem (jurd_jur_no, jurd_rek_kode, jurd_debet, jurd_uraian)
           VALUES (?, ?, ?, ?)`,
          [noBbm, d.rekkode, d.nominal, d.uraian],
        );
        await conn.query(
          `INSERT INTO tjurnalitem (jurd_jur_no, jurd_trs, jurd_nourut, jurd_uraian, jurd_kredit, jurd_rek_kode)
           VALUES (?, 'BBM', 1, ?, ?, ?)`,
          [noBbm, keterangan || "", d.nominal, rek_kode],
        );
      }

      i++;
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

// ── Data print ────────────────────────────────────────────────────────
const getPrintData = async (nomor) => {
  const [[h]] = await db.query(
    `
    SELECT h.jur_no AS nomor, h.jur_nota AS nota,
      h.jur_penerima AS penerima,
      DATE_FORMAT(h.jur_tanggal,'%Y-%m-%d') AS tanggal,
      DATE_FORMAT(h.jur_tanggal,'%d %b %Y') AS tanggal_fmt,
      h.jur_keterangan AS keterangan, h.jur_cabang AS cabang,
      u.user_nama AS kasir
    FROM tjurnal h
    LEFT JOIN tuser u ON u.user_kode = h.user_create
    WHERE h.jur_no = ?
  `,
    [nomor],
  );
  if (!h) throw new Error("Data tidak ditemukan.");

  const [detail] = await db.query(
    `
    SELECT jurd_nourut AS no, jurd_uraian AS uraian,
      jurd_debet AS nominal
    FROM tjurnalitem
    WHERE jurd_jur_no = ? AND jurd_trs = 'BKK'
    ORDER BY jurd_nourut
  `,
    [nomor],
  );

  const total = detail.reduce((s, d) => s + Number(d.nominal), 0);

  return { ...h, total, detail };
};

module.exports = {
  getAccountOptions,
  getAccountAll,
  getKeteranganOptions,
  getCostCenterOptions,
  getDcOptions,
  getDetailForm,
  saveData,
  getPrintData,
};
