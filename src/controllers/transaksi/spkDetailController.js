const svc = require("../../services/transaksi/spkDetailService");
const db = require("../../config/database");

module.exports = {
  getKategoriList: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.getKategoriList() });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  // ⬇️ BARU: endpoint untuk ambil template tahapan berdasarkan kode Master Proses.
  // Dipakai FE untuk visualisasi preview tahapan sebelum SPK disimpan.
  getTemplateByKategori: async (req, res) => {
    try {
      const rows = await svc.getTemplateByKategori(db, req.params.prsKode);
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  // Backfill tahap Master Proses yang belum pernah masuk ke SPK lama.
  syncTahap: async (req, res) => {
    try {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [[spk]] = await conn.query(
          `SELECT spk_prs_kode AS prsKode FROM tspk WHERE TRIM(spk_nomor) = TRIM(?)`,
          [req.params.nomor]
        );
        if (!spk) throw new Error("SPK tidak ditemukan.");

        const hasil = await svc.syncDetailForSpk(conn, req.params.nomor, spk.prsKode);
        await conn.commit();
        res.json({
          success: true,
          message:
            hasil.added > 0
              ? `${hasil.added} tahap berhasil ditambahkan.`
              : "Tahapan sudah sinkron dengan Master Proses.",
          data: hasil,
        });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
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