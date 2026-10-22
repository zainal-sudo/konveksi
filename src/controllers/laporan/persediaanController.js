const persediaanService = require("../../services/laporan/persediaanService");

const persediaanController = {
  getLaporan: async (req, res) => {
    try {
      const { gdgKode } = req.query;
      // User cabang otomatis dipaksa hanya melihat persediaan gudang cabangnya
      const data = await persediaanService.getLaporanPersediaan(
        gdgKode,
        req.user?.cabang
      );
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};

module.exports = persediaanController;