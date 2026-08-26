const { get } = require("../../routes/authRoutes");
const svc = require("../../services/transaksi/voucherPembayaranService");

const getBrowse = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "startDate dan endDate wajib diisi.",
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
        message: "startDate dan endDate wajib diisi.",
      });
    const data = await svc.getBrowseDetail(startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(req.params.nomor);
    res.json({ success: true, message: "Data berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const cekPengajuan = async (req, res) => {
  try {
    const result = await svc.cekPengajuan(req.params.nomor);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const requestPin5 = async (req, res) => {
  try {
    const { alasan } = req.body;
    if (!alasan || !alasan.trim())
      return res
        .status(400)
        .json({ success: false, message: "Alasan harus diisi." });
    await svc.requestPin5(req.params.nomor, alasan.trim(), req.user.kode);
    res.json({ success: true, message: "Berhasil diajukkan. Nunggu ACC." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getPrintData = async (req, res) => {
  try {
    const data = await svc.getPrintData(decodeURIComponent(req.params.nomor));
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
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

const getBrowseDetailPendingAll = async (req, res) => {
  try {
    const data = await svc.getBrowseDetailPendingAll();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getBrowse,
  getBrowseDetail,
  deleteData,
  cekPengajuan,
  requestPin5,
  getPrintData,
  getBrowsePendingAll,
  getBrowseDetailPendingAll,
};
