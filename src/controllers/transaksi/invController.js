const svc = require("../../services/transaksi/invService");

module.exports = {
  getBrowse: async (req, res) => {
    try {
      const data = await svc.getBrowse(req.query.startDate, req.query.endDate);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  getDetail: async (req, res) => {
    try {
      const data = await svc.getDetail(req.params.nomor);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  deleteData: async (req, res) => {
    try {
      await svc.deleteData(req.params.nomor);
      res.json({ success: true, message: "Invoice berhasil dihapus." });
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

  exportDetail: async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const data = await svc.getExportDetailData(startDate, endDate); // <-- Disesuaikan ke 'svc'
      res.json({ success: true, data }); // <-- Sekaligus disamakan formatnya { success: true, data }
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
};