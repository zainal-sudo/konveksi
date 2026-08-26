const db = require("../config/database");

/**
 * Mengecek apakah periode untuk tanggal transaksi sudah ditutup
 * berdasarkan tabel ttutupperiode (sesuai Delphi ulib).
 */
const cekTutupPeriode = async (tanggal) => {
  const dateObj = new Date(tanggal);
  if (isNaN(dateObj.getTime())) return false; // Fail-safe jika tanggal tidak valid

  const bulan = dateObj.getMonth() + 1; // JavaScript index bulan dimulai dari 0
  const tahun = dateObj.getFullYear();

  const [rows] = await db.query(
    `SELECT 1 FROM ttutupperiode WHERE tutup_bulan = ? AND tutup_tahun = ? LIMIT 1`,
    [bulan, tahun],
  );

  // Mengembalikan true jika ada data (periode ditutup), false jika kosong
  return rows.length > 0;
};

module.exports = { cekTutupPeriode };
