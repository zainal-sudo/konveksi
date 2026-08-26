const svc = require("../../services/posting/pembayaranCustomerFormService");

// GET /form?startDate&endDate
const getDataPosting = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib.",
      });
    const data = await svc.getDataPosting(startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /form/posting
// body: { items: [{Tanggal, Nomor, RekKode, Jenis, Nominal, Uraian, Status}] }
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

module.exports = { getDataPosting, doPosting };
