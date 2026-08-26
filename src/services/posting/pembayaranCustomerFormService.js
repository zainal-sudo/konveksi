const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");

// ── Helper: tentukan account kredit ──────────────────────────────────
// Delphi btnPostingClick — logika ckredit
// jenis='BG' → cek prefix dari uraian
// jenis lain (BT/CS) → cek prefix 2 digit dari nomor
const getAccountKredit = (jenis, nomor, uraian) => {
  let prefix;
  if (jenis === "BG") {
    // Delphi: Pos('JA',...), Pos('MD',...), Pos('KP',...), Pos('SM',...)/Pos('AI',...)
    const u = (uraian || "").toUpperCase();
    if (u.includes("JA")) prefix = "JA";
    else if (u.includes("MD")) prefix = "MD";
    else if (u.includes("KP")) prefix = "KP";
    else if (u.includes("SM") || u.includes("AI")) prefix = "SM";
    else prefix = "";
  } else {
    // Delphi: leftstr(nomor, 2)
    prefix = (nomor || "").substring(0, 2).toUpperCase();
  }

  if (prefix === "JA") return "A-121301";
  if (prefix === "MD") return "A-121201";
  if (prefix === "KP") return "A-121101";
  if (prefix === "SM" || prefix === "AI") return "A-121401";
  return null; // tidak dikenali
};

// ── Get data untuk posting ────────────────────────────────────────────
// Delphi btnRefreshClick:
//   Source: kencanaprint.terima_bayar_debet
//   Filter: kode IN ('BT','CS','BG') + date range
//   JOIN trekening (di finance DB) via tb_rek_kode
// Status: cek apakah sudah ada di tjurnal (jur_otomatis=2 AND jur_nomor=nomor)
//   → sudah ada = 'Sudah', belum = ''
const getDataPosting = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(a.tanggal, '%Y-%m-%d') AS Tanggal,
       a.nomor                             AS Nomor,
       a.tb_rek_kode                       AS RekKode,
       IFNULL(r.rek_nama, '')              AS RekNama,
       a.kode                              AS Jenis,
       a.debet                             AS Nominal,
       IFNULL(a.notes, '')                 AS Uraian,
       IFNULL(a.customer, '')              AS Customer,
       IF(
         EXISTS(
           SELECT 1 FROM tjurnal j
           WHERE j.jur_otomatis = 2 AND j.jur_nomor = a.nomor
         ), 'Sudah', ''
       )                                   AS Status
     FROM kencanaprint.terima_bayar_debet a
     LEFT JOIN trekening r ON r.rek_kode = a.tb_rek_kode
     WHERE a.kode IN ('BT', 'CS', 'BG')
       AND a.tanggal >= ?
       AND a.tanggal <= ?
     ORDER BY a.tanggal, a.nomor`,
    [startDate, endDate],
  );
  return rows;
};

// ── Posting ────────────────────────────────────────────────────────────
// Delphi btnPostingClick:
//   - Hanya proses baris status = '' (belum diposting)
//   - Per baris: delete lama → insert tjurnal + 2 tjurnalitem
//   - Return: array hasil per nomor {nomor, status: 'Sukses'/'Error', message}
const doPosting = async (items, userLogin) => {
  // Validasi: tidak ada data
  if (!items || items.length === 0) {
    throw new Error("Tidak ada data yang akan di posting.");
  }

  // Filter hanya yang belum diposting (status = '')
  const pending = items.filter((d) => (d.Status || "") === "");
  if (pending.length === 0) {
    throw new Error("Semua data sudah diposting.");
  }

  const results = [];
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    for (const row of pending) {
      const { Tanggal, Nomor, RekKode, Jenis, Nominal, Uraian } = row;

      // Cek tutup periode
      const tutup = await cekTutupPeriode(Tanggal);
      if (tutup) {
        results.push({
          nomor: Nomor,
          status: "Skip",
          message: "Periode sudah ditutup.",
        });
        continue;
      }

      // Tentukan account kredit
      const ckredit = getAccountKredit(Jenis, Nomor, Uraian);
      if (!ckredit) {
        results.push({
          nomor: Nomor,
          status: "Skip",
          message: "Prefix nomor tidak dikenali.",
        });
        continue;
      }

      // Delphi: DELETE FROM tjurnal WHERE jur_otomatis=2 AND jur_nomor=nomor
      await conn.query(
        `DELETE FROM tjurnal WHERE jur_otomatis = 2 AND jur_nomor = ?`,
        [Nomor],
      );

      // Delphi: INSERT INTO tjurnal
      await conn.query(
        `INSERT INTO tjurnal
           (jur_no, jur_nomor, jur_tanggal, jur_tipetransaksi, jur_cabang,
            jur_otomatis, jur_keterangan, jur_rek_kode, date_create, user_create)
         VALUES (?, ?, ?, 'PBC', 'P01', 2, ?, ?, NOW(), ?)`,
        [Nomor, Nomor, Tanggal, Uraian, RekKode, userLogin],
      );

      // Delphi: INSERT tjurnalitem — baris debet (header, tidak ada jurd_trs)
      await conn.query(
        `INSERT INTO tjurnalitem
           (jurd_jur_no, jurd_rek_kode, jurd_debet, jurd_uraian)
         VALUES (?, ?, ?, ?)`,
        [Nomor, RekKode, Number(Nominal), Uraian],
      );

      // Delphi: INSERT tjurnalitem — baris kredit (jurd_trs='PBC', nourut=1)
      await conn.query(
        `INSERT INTO tjurnalitem
           (jurd_jur_no, jurd_trs, jurd_nourut, jurd_uraian, jurd_kredit, jurd_rek_kode)
         VALUES (?, 'PBC', 1, ?, ?, ?)`,
        [Nomor, Uraian, Number(Nominal), ckredit],
      );

      results.push({ nomor: Nomor, status: "Sukses", message: "" });
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return results;
};

module.exports = { getDataPosting, doPosting };
