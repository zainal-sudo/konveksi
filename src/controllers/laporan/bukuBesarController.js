const svc = require("../../services/laporan/bukuBesarService");

// GET /default-account?cabang=P01
const getDefaultAccount = (req, res) => {
  try {
    const cabang = req.query.cabang || req.user?.cabang || "P01";
    const kode = svc.getDefaultAccount(cabang);
    res.json({ success: true, data: { kode } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /search-account?cabang=P01&search=kas
const searchAccount = async (req, res) => {
  try {
    const { search } = req.query;
    const cabang = req.query.cabang || req.user?.cabang || "P01";
    const data = await svc.searchAccount(cabang, search);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /account/:kode
const getAccountByKode = async (req, res) => {
  try {
    const data = await svc.getAccountByKode(req.params.kode);
    if (!data)
      return res.status(404).json({
        success: false,
        message: "Account tersebut belum terdaftar.",
      });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /?rekkode=A-111101&startDate=2026-06-01&endDate=2026-06-06
const getBukuBesar = async (req, res) => {
  try {
    const { rekkode, startDate, endDate } = req.query;
    if (!rekkode || !startDate || !endDate)
      return res.status(400).json({
        success: false,
        message: "rekkode, startDate, dan endDate wajib.",
      });
    const data = await svc.getBukuBesar(rekkode, startDate, endDate);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getDefaultAccount,
  searchAccount,
  getAccountByKode,
  getBukuBesar,
};
