const mutasiService = require("../../services/transaksi/mutasiService"); // 👈 Pastikan baris ini ada di paling atas

const mutasiController = {
  getBrowse: async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const data = await mutasiService.getBrowse(startDate, endDate);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getDetail: async (req, res) => {
    try {
      const { nomor } = req.params;
      const data = await mutasiService.getDetail(decodeURIComponent(nomor));
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  deleteData: async (req, res) => {
    try {
      const { nomor } = req.params;
      await mutasiService.deleteData(decodeURIComponent(nomor));
      res.json({ success: true, message: "Mutasi gudang berhasil dihapus." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  realisasiData: async (req, res) => {
    try {
      const { nomor } = req.params;
      const user = req.user;
      await mutasiService.realisasiData(decodeURIComponent(nomor), user);
      res.json({ success: true, message: "Mutasi gudang berhasil direalisasi." });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

module.exports = mutasiController;