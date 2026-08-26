const svc = require("../../services/transaksi/stbjFormService");

module.exports = {
  getGudang: async (req, res) => {
    try {
      const data = await svc.getGudang(req.query.search || "");
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  getBarang: async (req, res) => {
    try {
      const data = await svc.getBarang(req.query.search || "");
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
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
      const user = req.user; // Dari middleware auth (verifyToken)
      const result = await svc.saveData(req.body, user);
      res.json({ success: true, message: "STBJ berhasil disimpan.", data: result });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};