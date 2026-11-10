const svc = require("../../services/laporan/bukuPembantuUmService");

const getLaporan = async (req, res) => {
  try {
    const { startDate, endDate, cusKode } = req.query;
    if (!startDate || !endDate)
      return res
        .status(400)
        .json({
        success: false,
        message: "startDate dan endDate wajib diisi.",
      });

    const data = await svc.getData({
      startDate,
      endDate,
      cusKode,
      cabang: req.user?.cabang,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getLaporan };
