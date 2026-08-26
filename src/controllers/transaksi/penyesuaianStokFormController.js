const svc = require("../../services/transaksi/penyesuaianStokFormService");

module.exports = {
  getGudang: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getGudang(req.query.search || "") });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  getBarangByGudang: async (req, res) => {
    try {
      res.json({
        success: true,
        data: await svc.getBarangByGudang(req.params.gdgKode, req.query.search || ""),
      });
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
      res.json({ success: true, data, message: "Penyesuaian Stok berhasil disimpan." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};
