const svc = require("../../services/transaksi/uangMukaFormService");

const getAccountOptions = async (req, res) => {
  try {
    const { jenis, cabang } = req.query;
    res.json({
      success: true,
      data: await svc.getAccountOptions(
        jenis || "KAS",
        cabang || req.user.cabang,
      ),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getPengajuanOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getPengajuanOptions(req.query.cabang || req.user.cabang),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetailPengajuan = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetailPengajuan(req.params.pjhNomor),
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getDetailForm = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetailForm(req.params.nomor),
    });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const saveData = async (req, res) => {
  try {
    const data = await svc.saveData(req.body, req.user);
    res.json({ success: true, data, message: "Berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getSupplierOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getSupplierOptions(req.query.search || ""),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getPrintData = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getPrintData(req.params.nomor) });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

module.exports = {
  getAccountOptions,
  getPengajuanOptions,
  getDetailPengajuan,
  getDetailForm,
  saveData,
  getSupplierOptions,
  getPrintData,
};
