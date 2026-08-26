const db = require("../../config/database");

// ── Default account per cabang ────────────────────────────────────────
// Delphi FormShow: P01→A-111101, P02→A-111102, P04→A-111103
const getDefaultAccount = (cabang) => {
  if (cabang === "P01") return "A-111101";
  if (cabang === "P02") return "A-111102";
  if (cabang === "P04") return "A-111103";
  return "A-111101";
};

// ── Search account ────────────────────────────────────────────────────
// Delphi bantuanreka:
//   P01: rek_kol_id=1 OR rek_kol_id=12
//   Lainnya: rek_cabang = cabang
const searchAccount = async (cabang, search) => {
  let sql;
  const params = [];

  if (cabang === "P01") {
    sql = `SELECT rek_kode AS kode, rek_nama AS nama
           FROM trekening
           WHERE rek_isaktif = 0
             AND (rek_kol_id = 1 OR rek_kol_id = 12)
           ORDER BY rek_kode`;
  } else {
    sql = `SELECT rek_kode AS kode, rek_nama AS nama
           FROM trekening
           WHERE rek_isaktif = 0
             AND rek_cabang = ?
           ORDER BY rek_kode`;
    params.push(cabang);
  }

  const [rows] = await db.query(sql, params);
  return rows;
};

// ── Validasi account ──────────────────────────────────────────────────
// Delphi edtrekkodeExit: cek apakah kode ada di trekening
const getAccountByKode = async (kode) => {
  const [[row]] = await db.query(
    `SELECT rek_kode AS kode, rek_nama AS nama
     FROM trekening WHERE rek_kode = ?`,
    [kode],
  );
  return row || null;
};

// ── Buku Besar ────────────────────────────────────────────────────────
// Delphi btnRefreshClick — dua langkah:
//   1. Hitung saldo awal: SUM(jurd_kredit - jurd_debet) sebelum startDate
//   2. Query transaksi periode + hitung running saldo di Node.js
//
// Delphi pakai temp table MySQL; di web kita hitung running saldo di memori
const getBukuBesar = async (rekkode, startDate, endDate) => {
  // ── Step 1: Saldo Awal ─────────────────────────────────────────────
  // Delphi: SUM(jurd_kredit - jurd_debet) WHERE jurd_nourut<>0
  //         AND jur_rek_kode = rekkode AND jur_tanggal < startDate
  const [[saldoRow]] = await db.query(
    `SELECT IFNULL(SUM(d.jurd_kredit - d.jurd_debet), 0) AS Saldo
     FROM tjurnalitem d
     INNER JOIN tjurnal j ON j.jur_no = d.jurd_jur_no
     WHERE d.jurd_nourut <> 0
       AND j.jur_rek_kode = ?
       AND j.jur_tanggal < ?`,
    [rekkode, startDate],
  );
  let xsaldo = Number(saldoRow.Saldo) || 0;

  // ── Step 2: Transaksi periode ──────────────────────────────────────
  // Delphi query utama:
  //   b = tjurnalitem WHERE nourut=0 AND rek_kode=filter (header/trigger)
  //   c = tjurnalitem WHERE nourut<>0 (detail/lawan) JOIN ke b via jur_no
  //   Debet/Kredit dibalik dari perspektif lawan:
  //     debet  = IF(jurd_kredit<>0, jurd_kredit, 0)
  //     kredit = IF(jurd_debet<>0,  jurd_debet,  0)
  //   Nomor: IF(jur_otomatis=0 OR jur_otomatis=2, jur_no, MID(jur_no,3,18))
  //   TglTransfer: IFNULL(t.tanggal, s.sh_tgltransfer) dari terima_bayar_debet / tsetor_hdr
  //   Sort: jur_tanggal, v.nourut (dari ttrs), jur_no
  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(a.jur_tanggal, '%Y-%m-%d')    AS Tanggal,
       IF(a.jur_otomatis = 0 OR a.jur_otomatis = 2,
         a.jur_no,
         MID(a.jur_no, 3, 18)
       )                                           AS Nomor,
       a.jur_tipetransaksi                        AS Trs,
       IFNULL(a.jur_nota, '')                     AS Nota,
       IFNULL(a.jur_penerima, '')                 AS Penerima,
       IFNULL(c.jurd_uraian, '')                  AS Keterangan,
       IF(c.jurd_kredit <> 0, c.jurd_kredit, 0)  AS Debet,
       IF(c.jurd_debet  <> 0, c.jurd_debet,  0)  AS Kredit,
       IFNULL(c.jurd_rek_kode, '')                AS Account,
       IFNULL(c.rek_nama, '')                     AS NamaAccount,
       DATE_FORMAT(
         IFNULL(t.tanggal, s.sh_tgltransfer),
         '%Y-%m-%d'
       )                                           AS TglTransfer
     FROM tjurnalitem b
     LEFT JOIN tjurnal a ON a.jur_no = b.jurd_jur_no
     LEFT JOIN kencanaprint.terima_bayar_debet t ON t.nomor = a.jur_nomor
     LEFT JOIN retail.tsetor_hdr s ON s.sh_nomor = a.jur_nomor
     LEFT JOIN ttrs v ON v.kode = a.jur_tipetransaksi
     LEFT JOIN (
       SELECT
         x.jurd_jur_no,
         x.jurd_nourut,
         x.jurd_rek_kode,
         y.rek_nama,
         x.jurd_debet,
         x.jurd_kredit,
         x.jurd_uraian
       FROM tjurnalitem x
       LEFT JOIN trekening y ON y.rek_kode = x.jurd_rek_kode
       WHERE x.jurd_nourut <> 0
     ) c ON c.jurd_jur_no = b.jurd_jur_no
     WHERE b.jurd_nourut = 0
       AND b.jurd_rek_kode = ?
       AND a.jur_tanggal BETWEEN ? AND ?
     ORDER BY a.jur_tanggal, v.nourut, a.jur_no`,
    [rekkode, startDate, endDate],
  );

  // ── Step 3: Hitung running saldo di Node.js ────────────────────────
  // Delphi: xsaldo = xsaldo + debet - kredit per baris
  const result = [];

  // Baris pertama: Saldo Awal
  result.push({
    Tanggal: startDate,
    Nomor: "",
    Trs: "",
    Nota: "",
    Penerima: "",
    Keterangan: "Saldo Awal",
    Debet: 0,
    Kredit: 0,
    Saldo: xsaldo,
    Account: "",
    NamaAccount: "",
    TglTransfer: null,
  });

  for (const row of rows) {
    xsaldo = xsaldo + Number(row.Debet) - Number(row.Kredit);
    result.push({
      Tanggal: row.Tanggal,
      Nomor: row.Nomor,
      Trs: row.Trs,
      Nota: row.Nota,
      Penerima: row.Penerima,
      Keterangan: row.Keterangan,
      Debet: Number(row.Debet),
      Kredit: Number(row.Kredit),
      Saldo: xsaldo,
      Account: row.Account,
      NamaAccount: row.NamaAccount,
      TglTransfer: row.TglTransfer,
    });
  }

  return result;
};

module.exports = {
  getDefaultAccount,
  searchAccount,
  getAccountByKode,
  getBukuBesar,
};
