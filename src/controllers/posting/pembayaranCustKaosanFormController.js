const svc = require("../../services/posting/pembayaranCustKaosanFormService");

// GET /form/cabang
const getCabang = async (req, res) => {
  try {
    const data = await svc.getCabang();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /form?startDate&endDate&cabang
const getDataPosting = async (req, res) => {
  try {
    const { startDate, endDate, cabang } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib.",
      });
    const data = await svc.getDataPosting(
      startDate,
      endDate,
      cabang || "ALL",
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /form/posting
const doPosting = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({
        success: false,
        message: "items wajib diisi.",
      });
    const userLogin = req.user?.kode || req.user?.username || "";
    const results = await svc.doPosting(items, userLogin);
    const sukses = results.filter((r) => r.status === "Sukses").length;
    res.json({
      success: true,
      message: `Posting selesai. ${sukses} dari ${results.length} data berhasil diposting.`,
      data: results,
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getCabang, getDataPosting, doPosting };