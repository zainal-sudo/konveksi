const svc = require("../../services/laporan/harianService");

// GET /laporan/harian?tanggal=YYYY-MM-DD
const getBrowse = async (req, res) => {
  try {
    const { tanggal } = req.query;
    if (!tanggal) {
      return res.status(400).json({ success: false, message: "tanggal wajib." });
    }
    const data = await svc.getBrowse(tanggal, req.user?.cabang);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /laporan/harian/print?tanggal=YYYY-MM-DD
const getPrintData = async (req, res) => {
  try {
    const { tanggal } = req.query;
    if (!tanggal) {
      return res.status(400).json({ success: false, message: "tanggal wajib." });
    }
    const data = await svc.getPrintData(tanggal, req.user?.cabang);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getBrowse, getPrintData };
