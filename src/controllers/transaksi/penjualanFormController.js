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
  getUangMukaOptions: async (req, res) => {
    try {
      res.json({
        success: true,
        data: await svc.getUangMukaOptions(
          req.query.cusKode || "",
          req.query.search || "",
          req.query.excludeNomor || "",
          req.user?.cabang || "00"
        ),
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  getCustomerDp: async (req, res) => {
    try {
      res.json({
        success: true,
        data: await svc.getCustomerDp(
          req.query.cusKode || "",
          req.query.target || 0,
          req.query.excludeNomor || "",
          req.user?.cabang || "00"
        ),
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
      res.json({ success: true, data, nomor: data.nomor, message: "Penjualan berhasil disimpan." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
  savePending: async (req, res) => {
    try {
      const data = await svc.savePending(req.body, req.user);
      res.json({ success: true, data, nomor: data.nomor, message: "Transaksi dipending." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
  getPendingList: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getPendingList(req.user) });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  takePending: async (req, res) => {
    try {
      const { noPending } = req.body || {};
      if (!noPending) return res.status(400).json({ success: false, message: "Nomor pending wajib dipilih." });
      const data = await svc.takePending(noPending, req.user);
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};
