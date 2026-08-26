const svc = require("../../services/transaksi/bbmFormService");

const getAccountOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getAccountOptions(req.query.cabang || "P01"),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getAccountAll = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getAccountAll() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getCostCenterOptions = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getCostCenterOptions() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getDcOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDcOptions(req.params.cckode),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getDetailForm = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetailForm(decodeURIComponent(req.params.nomor)),
    });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};
const saveData = async (req, res) => {
  try {
    const data = await svc.saveData(req.body, req.user);
    res.json({ success: true, data, message: "BBM berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
const getPrintData = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getPrintData(decodeURIComponent(req.params.nomor)),
    });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

module.exports = {
  getAccountOptions,
  getAccountAll,
  getCostCenterOptions,
  getDcOptions,
  getDetailForm,
  saveData,
  getPrintData,
};
