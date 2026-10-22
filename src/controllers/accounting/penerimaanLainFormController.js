const svc = require("../../services/accounting/penerimaanLainFormService");

const getMaxNomor = async (req, res) => {
  try {
    const { tanggal, cabang, tipe } = req.query;
    if (!tanggal || !cabang || !tipe) {
      return res.status(400).json({ success: false, message: "tanggal, cabang, dan tipe wajib." });
    }
    const nomor = await svc.getMaxNomor(tanggal, cabang, tipe);
    res.json({ success: true, data: { nomor } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchAccount = async (req, res) => {
  try {
    const { search, tipe } = req.query;
    const data = await svc.searchAccount(search || "", tipe || "KM");
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getAccountByKode = async (req, res) => {
  try {
    const { kode } = req.query;
    if (!kode) {
      return res.status(400).json({ success: false, message: "kode wajib." });
    }
    const data = await svc.getAccountByKode(kode);
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const searchCostCenter = async (req, res) => {
  try {
    const data = await svc.searchCostCenter();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchCustomer = async (req, res) => {
  try {
    const data = await svc.searchCustomer(req.query.search || "");
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const cekBiaya = async (req, res) => {
  try {
    const { account } = req.query;
    if (!account) {
      return res.status(400).json({ success: false, message: "account wajib." });
    }
    const needCustomer = await svc.cekBiaya(account);
    res.json({ success: true, data: { needCustomer } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const cekPeriode = async (req, res) => {
  try {
    const { tanggal } = req.query;
    if (!tanggal) {
      return res.status(400).json({ success: false, message: "tanggal wajib." });
    }
    const closed = await svc.cekTutupPeriode(tanggal);
    res.json({ success: true, data: { closed } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetailForm = async (req, res) => {
  try {
    const data = await svc.getDetailForm(decodeURIComponent(req.params.nomor));
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const saveData = async (req, res) => {
  try {
    const data = await svc.saveData(req.body, req.user);
    res.json({ success: true, data, message: "Penerimaan lain berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = {
  getMaxNomor,
  searchAccount,
  getAccountByKode,
  searchCostCenter,
  searchCustomer,
  cekBiaya,
  cekPeriode,
  getDetailForm,
  saveData,
};