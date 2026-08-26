const svc = require("../../services/transaksi/pengajuanTransferFormService");

const getAccountOptions = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getAccountOptions() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getSupplierOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getSupplierOptions(req.query.search),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getSupplierDetail = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getSupplierDetail(req.params.kode),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getVoucherOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getVoucherOptions(req.query.search),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getPoExternalOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getPoExternalOptions(req.query.search),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getPettyCashOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getPettyCashOptions(req.query.search),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getAccountAll = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getAccountAll(req.query.search),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getCostCenterOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getCostCenterOptions(req.query.search),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getDcOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDcOptions(req.params.cckode, req.query.search),
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
    res.json({
      success: true,
      data,
      message: "Pengajuan Transfer berhasil disimpan.",
    });
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
  getSupplierOptions,
  getSupplierDetail,
  getVoucherOptions,
  getPoExternalOptions,
  getPettyCashOptions,
  getAccountAll,
  getCostCenterOptions,
  getDcOptions,
  getDetailForm,
  saveData,
  getPrintData,
};
