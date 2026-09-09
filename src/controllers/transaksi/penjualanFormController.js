const svc = require("../../services/transaksi/penjualanFormService");

module.exports = {
  getCustomerOptions: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getCustomerOptions(req.query.search || "") });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  getBarangOptions: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getBarangOptions(req.query.search || "") });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  getDetailForm: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getDetailForm(req.params.nomor) });
    } catch (e) {
      res.status(404).json({ success: false, message: e.message });
    }
  },
  saveData: async (req, res) => {
    try {
      const data = await svc.saveData(req.body, req.user);
      res.json({ success: true, data, nomor: data.nomor, message: "Penjualan berhasil disimpan." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};
