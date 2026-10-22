const svc = require("../../services/laporan/neracaLabaRugiService");

const getNeraca = async (req, res) => {
  try {
    const { endDate } = req.query;
    if (!endDate)
      return res.status(400).json({
        success: false,
        message: "endDate wajib diisi (tanggal saldo neraca).",
      });
    const data = await svc.getNeraca(endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getLabaRugi = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib diisi.",
      });
    const data = await svc.getLabaRugi(startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getNeraca, getLabaRugi };
