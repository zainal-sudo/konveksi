const db = require("../../config/database");

// ── List Jurnal ───────────────────────────────────────────────────────
// Delphi loaddata:
//   SELECT ... FROM all_jurnal a WHERE a.tanggal BETWEEN ? AND ?
// all_jurnal adalah VIEW yang sudah ada di database finance
// Kolom: Bulan, Tahun, Tanggal, Nomor, Referensi, Account,
//         AccountName, Keterangan, Debet, Kredit, DetailCC
const getListJurnal = async (startDate, endDate, cabang = "00") => {
  const params = [startDate, endDate];
  let sql = `SELECT
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
  `;

  // User cabang ("01","02",..) hanya melihat jurnal milik cabangnya
  // (prefix kode cabang pada nomor jurnal); "00" (pusat) melihat semua.
  if (cabang && String(cabang).trim() !== "00") {
    sql += ` AND a.Nomor LIKE ?`;
    params.push(`${String(cabang).trim()}-%`);
  }

  sql += ` ORDER BY a.Tanggal, a.Nomor`;

  const [rows] = await db.query(sql, params);
  return rows;
};

module.exports = { getListJurnal };
