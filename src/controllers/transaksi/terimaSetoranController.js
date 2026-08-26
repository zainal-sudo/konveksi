const svc = require("../../services/transaksi/terimaSetoranService");

// ── GET /cabang ───────────────────────────────────────────────────────
const getCabang = async (req, res) => {
  try {
    const data = await svc.getCabang();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── GET /?startDate&endDate&cabang ────────────────────────────────────
const getBrowse = async (req, res) => {
  try {
    const { startDate, endDate, cabang } = req.query;
    if (!startDate || !endDate || !cabang)
      return res.status(400).json({
        success: false,
        message: "startDate, endDate, dan cabang wajib.",
      });
    const data = await svc.getBrowse(startDate, endDate, cabang);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── GET /detail?startDate&endDate&cabang ──────────────────────────────
const getBrowseDetail = async (req, res) => {
  try {
    const { startDate, endDate, cabang } = req.query;
    if (!startDate || !endDate || !cabang)
      return res.status(400).json({
        success: false,
        message: "startDate, endDate, dan cabang wajib.",
      });
    const data = await svc.getBrowseDetail(startDate, endDate, cabang);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getBrowsePendingAll = async (req, res) => {
  try {
    const data = await svc.getBrowsePendingAll();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getCabang, getBrowse, getBrowseDetail, getBrowsePendingAll };
