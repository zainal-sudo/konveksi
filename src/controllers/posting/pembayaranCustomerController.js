const svc = require("../../services/posting/pembayaranCustomerService");

const getBrowse = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib.",
      });
    const data = await svc.getBrowse(startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getBrowseDetail = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib.",
      });
    const data = await svc.getBrowseDetail(startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(decodeURIComponent(req.params.nomor));
    res.json({ success: true, message: "Data berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getBrowse, getBrowseDetail, deleteData };
