const svc = require("../../services/laporan/listJurnalService");

// GET /laporan/list-jurnal?startDate&endDate
const getListJurnal = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib.",
      });
    const data = await svc.getListJurnal(startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getListJurnal };
