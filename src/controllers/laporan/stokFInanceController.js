const svc = require("../../services/laporan/stokFinanceService");

// GET /cabang
const getCabangList = async (req, res) => {
  try {
    const data = await svc.getCabangList();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
// GET /?cabang=P04
const getStokFinance = async (req, res) => {
  try {
    const { cabang } = req.query;
    if (!cabang)
      return res.status(400).json({
        success: false,
        message: "Parameter cabang wajib diisi.",
      });

    const [master, detail] = await Promise.all([
      svc.getMaster(cabang),
      svc.getDetail(cabang),
    ]);

    res.json({ success: true, data: { master, detail } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getCabangList, getStokFinance };
