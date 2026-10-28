const svc = require("../../services/transaksi/spkService");

module.exports = {
  getBrowse: async (req, res) => {
    try {
      const exclude =
        req.query.excludeSelesai === "1" || req.query.excludeSelesai === "true";
      // excludeClosed: dipakai pemilih SPK di form LHK — SPK yang sudah
      // CLOSED tidak boleh dilanjutkan, jadi disembunyikan dari daftar.
      const excludeClosed =
        req.query.excludeClosed === "1" || req.query.excludeClosed === "true";
      res.json({
        success: true,
        data: await svc.getBrowse(req.query.startDate, req.query.endDate, {
          excludeSelesai: exclude,
          excludeClosed,
        }),
      });
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
  getBrowseDetailAll: async (req, res) => {
    try {
      const data = await svc.getBrowseDetailAll(req.query.startDate, req.query.endDate);
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
  // Update/close status SPK (revisi 2026-10-05). Memo TIDAK lagi jadi
  // syarat di sini — memo diisi terpisah lewat updateMemo, dan hanya bisa
  // setelah status CLOSED. Syarat close: sudah ada laporan LHK pada tahap
  // proses terakhir. 400 karena penolakan ini foreseeable (bukan error
  // server).
  closeStatus: async (req, res) => {
    try {
      const data = await svc.closeStatus(req.params.nomor, req.body, req.user);
      res.json({ success: true, message: "Status SPK berhasil ditutup.", data });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
  // Simpan memo/catatan hasil produksi. Hanya boleh kalau status sudah
  // CLOSED — inilah yang membuat kolom memo di header bisa diklik setelah
  // close, dan terkunci sebelum itu.
  updateMemo: async (req, res) => {
    try {
      const data = await svc.updateMemo(req.params.nomor, req.body);
      res.json({ success: true, message: "Memo SPK berhasil disimpan.", data });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
  getKomposisi: async (req, res) => {
    try {
      const { brgKode } = req.params;
      if (!brgKode) {
        return res.status(400).json({ success: false, message: "Kode barang harus diisi." });
      }
      const data = await svc.getKomposisiByBarang(brgKode);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
  // Kebutuhan bahan untuk satu SPK: komposisi barang jadi x jumlah target.
  getKebutuhanBahan: async (req, res) => {
    try {
      const data = await svc.getKebutuhanBahan(req.params.nomor);
      res.json({ success: true, data });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  },
};