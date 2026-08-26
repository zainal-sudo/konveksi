const svc = require("../../services/transaksi/spkService");

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
      const data = await svc.getBrowseDetail(req.params.nomor);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  deleteData: async (req, res) => {
    try {
      await svc.deleteData(req.params.nomor);
      res.json({ success: true, message: "SPK berhasil dihapus." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};