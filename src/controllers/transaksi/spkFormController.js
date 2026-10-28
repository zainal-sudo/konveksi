const svc = require("../../services/transaksi/spkFormService");

module.exports = {
  getInitData: async (req, res) => {
    try {
      const nomorOtomatis = await svc.getNomorPreview(req.query.tanggal);
      res.json({ success: true, data: { nomorOtomatis } });
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
  getCustomerOptions: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getCustomerOptions(req.query.search || "") });
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
      res.json({ success: true, data: await svc.saveData(req.body, req.user), message: "SPK berhasil disimpan." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};