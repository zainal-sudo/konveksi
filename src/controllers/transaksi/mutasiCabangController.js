const svcOut = require("../../services/transaksi/mutasiCabangOutService");
const svcOutForm = require("../../services/transaksi/mutasiCabangOutFormService");
const svcIn = require("../../services/transaksi/mutasiCabangInService");
const svcInForm = require("../../services/transaksi/mutasiCabangInFormService");

// ── Cabang aktif dari token; pusat boleh 'ALL' ───────────────────────
const cabangOf = (req) => {
  const cbg = String(req.user?.cabang || "00");
  const param = String(req.query.cabang || req.body?.cabang || "");
  if (cbg !== "00") return cbg; // user cabang terkunci ke cabangnya
  return param && param !== "ALL" ? param : "ALL";
};

// ===== Mutasi Out (kirim antar cabang) ================================
const browseOut = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await svcOut.getBrowse(startDate, endDate, cabangOf(req));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const detailOut = async (req, res) => {
  try {
    const data = await svcOut.getBrowseDetail(req.params.nomor);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const nomorOut = async (req, res) => {
  try {
    // user cabang: nomor pakai cabangnya; pusat: wajib pilih cabang asal
    const cbg = String(req.user?.cabang || "00");
    const cabang = cbg !== "00" ? cbg : String(req.query.cabangAsal || "");
    if (!cabang) return res.status(400).json({ success: false, message: "Cabang asal belum dipilih." });
    const nomor = await svcOutForm.getMaxNomor(req.query.tanggal, cabang);
    res.json({ success: true, data: { nomor } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const cabangList = async (req, res) => {
  try {
    const data = await svcOutForm.getCabang();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const gudangOut = async (req, res) => {
  try {
    const cbg = String(req.user?.cabang || "00");
    const cabangKode = cbg !== "00" ? cbg : String(req.query.cabangAsal || "");
    const data = await svcOutForm.getGudang(cabangKode);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchSKU = async (req, res) => {
  try {
    const data = await svcOutForm.searchSKU(req.query.gudang, req.query.q || "");
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const formOut = async (req, res) => {
  try {
    const data = await svcOutForm.getDetailForm(decodeURIComponent(req.params.nomor));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveOut = async (req, res) => {
  try {
    const data = await svcOutForm.saveData(req.body, req.user);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// ===== Mutasi In (terima antar cabang) ================================
const browseIn = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await svcIn.getBrowse(startDate, endDate, cabangOf(req));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const detailIn = async (req, res) => {
  try {
    const data = await svcIn.getBrowseDetail(req.params.nomor);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const nomorIn = async (req, res) => {
  try {
    const cbg = String(req.user?.cabang || "00");
    const cabang = cbg !== "00" ? cbg : String(req.query.cabangTujuan || "");
    if (!cabang) return res.status(400).json({ success: false, message: "Cabang tujuan belum dipilih." });
    const nomor = await svcInForm.getMaxNomor(req.query.tanggal, cabang);
    res.json({ success: true, data: { nomor } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const gudangIn = async (req, res) => {
  try {
    const cbg = String(req.user?.cabang || "00");
    const cabangKode = cbg !== "00" ? cbg : String(req.query.cabangTujuan || "");
    const data = await svcInForm.getGudang(cabangKode);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchMutasiOut = async (req, res) => {
  try {
    const cbg = String(req.user?.cabang || "00");
    const cabangTujuan = cbg !== "00" ? cbg : String(req.query.cabangTujuan || "");
    const data = await svcInForm.searchMutasiOut(cabangTujuan);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const loadDataMutasi = async (req, res) => {
  try {
    const data = await svcInForm.loadDataMutasi(req.query.nomor);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const formIn = async (req, res) => {
  try {
    const data = await svcInForm.getDetailForm(decodeURIComponent(req.params.nomor));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveIn = async (req, res) => {
  try {
    const data = await svcInForm.saveData(req.body, req.user);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = {
  browseOut, detailOut, nomorOut, cabangList, gudangOut, searchSKU, formOut, saveOut,
  browseIn, detailIn, nomorIn, gudangIn, searchMutasiOut, loadDataMutasi, formIn, saveIn,
};
