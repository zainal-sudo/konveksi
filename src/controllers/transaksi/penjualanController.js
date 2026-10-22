const svc = require("../../services/transaksi/penjualanService");

module.exports = {
  getBrowse: async (req, res) => {
    try {
      const todayStr = new Date().toISOString().substring(0, 10);
      const startDate = req.query.startDate || todayStr;
      const endDate = req.query.endDate || todayStr;
      // User cabang hanya boleh melihat nota cabangnya sendiri
      const resData = await svc.getBrowse(startDate, endDate, req.user?.cabang);
      res.json({ success: true, data: resData });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  getBrowseDetail: async (req, res) => {
    try {
      const data = await svc.getBrowseDetail(req.params.nomor);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  deleteData: async (req, res) => {
    try {
      await svc.deleteData(req.params.nomor);
      res.json({ success: true, message: "Penjualan berhasil dihapus." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },

  updateStatus: async (req, res) => {
    try {
      const user = req.user?.username || req.user?.nama || req.user?.kode || "SYSTEM";
      const result = await svc.updateStatus(req.params.nomor, user);
      res.json({ success: true, message: `Status penjualan berhasil diubah menjadi ${result.Status}.`, data: result });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },

  getPrintData: async (req, res) => {
    try {
      const data = await svc.getPrintData(decodeURIComponent(req.params.nomor));
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
};
