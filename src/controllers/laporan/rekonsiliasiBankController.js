const svc = require("../../services/laporan/rekonsiliasiBankService");

// GET /?startDate=2026-06-01&endDate=2026-06-06
const getRekonsiliasi = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib.",
      });
    const data = await svc.getRekonsiliasi(startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getRekonsiliasi };
