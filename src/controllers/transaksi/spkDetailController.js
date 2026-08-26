const svc = require("../../services/transaksi/spkDetailService");

module.exports = {
  getKategoriList: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getKategoriList() });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  getProsesByBarang: async (req, res) => {
    try {
      const ktgKode = await svc.getKtgKodeIfHasTemplate(req.params.brgKode);
      // ktgKode bisa null (barang belum ada kategori / belum ada template) — itu normal
      res.json({ success: true, data: { ktgKode } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  getBySpk: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getDetailBySpk(req.params.nomor) });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  update: async (req, res) => {
    try {
      await svc.updateDetail(req.params.id, req.body);
      res.json({ success: true, message: "Tahap proses berhasil diperbarui." });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};