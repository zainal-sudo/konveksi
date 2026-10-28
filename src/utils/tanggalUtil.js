// ── Validasi range tanggal browse ───────────────────────────────────────
// Dipakai semua controller browse (SO/DO/FP/Penerimaan) supaya tanggalAwal
// tidak pernah lebih besar dari tanggalAkhir. Melempar Error biar digiring
// ke response error yang sudah ada di tiap controller.
const isValidTanggalRange = (startDate, endDate) => {
  if (!startDate || !endDate) return true;
  if (typeof startDate !== "string" || typeof endDate !== "string") return false;
  return startDate <= endDate;
};

const validasiRangeTanggal = (startDate, endDate) => {
  if (!startDate || !endDate) return;
  if (!isValidTanggalRange(startDate, endDate)) {
    throw new Error("Tanggal awal tidak boleh lebih besar dari tanggal akhir.");
  }
};

module.exports = { validasiRangeTanggal };