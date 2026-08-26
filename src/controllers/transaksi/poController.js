const svc = require("../../services/transaksi/poService");

module.exports = {
  getBrowse: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getBrowse(req.query.startDate, req.query.endDate) });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  getBrowseDetail: async (req, res) => {
    try {
      console.log(`[PO getBrowseDetail] req.params.nomor = "${req.params.nomor}"`);

      const data = await svc.getBrowseDetail(req.params.nomor);
      res.json({ success: true, data });
    } catch (e) {
      console.error("[PO getBrowseDetail] error:", e);
      res.status(500).json({ success: false, message: e.message });
    }
  },

  deleteData: async (req, res) => {
    try {
      await svc.deleteData(req.params.nomor);
      res.json({ success: true, message: "PO berhasil dihapus." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },

  updateStatus: async (req, res) => {
    try {
      const user = req.user?.username || req.user?.nama || "SYSTEM";
      const result = await svc.updateStatus(req.params.nomor, user);
      res.json({ success: true, message: `Status PO berhasil diubah menjadi ${result.Status}.`, data: result });
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
  }
};