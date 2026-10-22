const svc = require("../../services/laporan/penjualanItemService");

const getPenjualanItem = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib diisi.",
      });
    }
    // User cabang otomatis dipaksa hanya melihat penjualan cabangnya sendiri;
    // user pusat (cabang "00") bisa memilih all cabang / pusat / cabang tertentu
    const data = await svc.getPenjualanItem(
      startDate,
      endDate,
      req.user?.cabang,
      req.query.cabang
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getPenjualanItem };
