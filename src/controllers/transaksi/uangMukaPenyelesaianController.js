const svc = require("../../services/transaksi/uangMukaPenyelesaianService");

const getFormData = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getFormData(req.params.nomor) });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const getAccountOptions = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getAccountOptions(
        req.query.jenis || "KAS",
        req.query.cabang || "P01",
      ),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getAccountByKode = async (req, res) => {
  try {
    const data = await svc.getAccountByKode(req.params.kode);
    res.json({ success: true, data });
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

const saveData = async (req, res) => {
  try {
    const data = await svc.saveData(req.body, req.user);
    res.json({
      success: true,
      data,
      message: "Penyelesaian berhasil disimpan.",
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// ── Bantuan Pencarian (F1 - F5) ───────────────────────────────────────

const getListPengajuanGA = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getListPengajuanGA(req.query.cabang),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetailPengajuanGA = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetailPengajuanGA(req.params.nomor),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getListPoExternal = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getListPoExternal() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getListVoucher = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getListVoucher() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getListPermintaanGarmen = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getListPermintaanGarmen(req.query.cabang),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetailPermintaanGarmen = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetailPermintaanGarmen(req.params.nomor),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getListInvoiceGarmen = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getListInvoiceGarmen() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetailInvoiceGarmen = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetailInvoiceGarmen(req.params.nomor),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const createSupplier = async (req, res) => {
  try {
    const kode = await svc.createSupplier(req.body, req.user.kode);
    res.json({ success: true, data: { kode } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getFormData,
  getAccountOptions,
  getCostCenterOptions,
  getDcOptions,
  saveData,
  getAccountByKode,
  getListPengajuanGA,
  getDetailPengajuanGA,
  getListPoExternal,
  getListVoucher,
  getListPermintaanGarmen,
  getDetailPermintaanGarmen,
  getListInvoiceGarmen,
  getDetailInvoiceGarmen,
  createSupplier,
};
