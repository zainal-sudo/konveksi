const svc = require("../../services/laporan/kasbonBelumSelesaiService");

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

// GET /?rekkode=A-111101
// Returns: { master: [...], detail: [...] }
const getKasbonBelumSelesai = async (req, res) => {
  try {
    const { rekkode } = req.query;
    if (!rekkode)
      return res.status(400).json({
        success: false,
        message: "rekkode wajib diisi.",
      });
    const data = await svc.getKasbonBelumSelesai(rekkode);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getDefaultAccount,
  searchAccount,
  getAccountByKode,
  getKasbonBelumSelesai,
};
