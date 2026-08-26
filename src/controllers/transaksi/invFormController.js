const svc = require("../../services/transaksi/invFormService");

module.exports = {
  getBpbOptions: async (req, res) => {
    try {
      const data = await svc.getBpbOptions(req.query.search || "", req.query.includeNomor || null);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  getBpbDetail: async (req, res) => {
    try {
      const data = await svc.getBpbDetail(req.params.nomor);
      res.json({ success: true, data });
    } catch (e) {
      res.status(404).json({ success: false, message: e.message });
    }
  },
  getDetailForm: async (req, res) => {
    try {
      const data = await svc.getDetailForm(req.params.nomor);
      res.json({ success: true, data });
    } catch (e) {
      res.status(404).json({ success: false, message: e.message });
    }
  },
  saveData: async (req, res) => {
    try {
      const data = await svc.saveData(req.body, req.user);
      res.json({ success: true, data, message: "Invoice berhasil disimpan." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};