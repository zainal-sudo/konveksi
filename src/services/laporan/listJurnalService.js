const db = require("../../config/database");

// ── List Jurnal ───────────────────────────────────────────────────────
// Delphi loaddata:
//   SELECT ... FROM all_jurnal a WHERE a.tanggal BETWEEN ? AND ?
// all_jurnal adalah VIEW yang sudah ada di database finance
// Kolom: Bulan, Tahun, Tanggal, Nomor, Referensi, Account,
//         AccountName, Keterangan, Debet, Kredit, DetailCC
const getListJurnal = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       MONTH(a.Tanggal)                          AS Bulan,
       YEAR(a.Tanggal)                           AS Tahun,
       DATE_FORMAT(a.Tanggal, '%Y-%m-%d')        AS Tanggal,
       a.Nomor,
       a.Referensi,
       a.Account,
       a.AccountName,
       a.Keterangan,
       IFNULL(a.Debet, 0)                        AS Debet,
       IFNULL(a.Kredit, 0)                       AS Kredit,
       IFNULL(a.Costcenter, '')                    AS DetailCC
     FROM alljurnal a
     WHERE a.Tanggal BETWEEN ? AND ?
     ORDER BY a.Tanggal, a.Nomor
`,
    [startDate, endDate],
  );
  return rows;
};

module.exports = { getListJurnal };
