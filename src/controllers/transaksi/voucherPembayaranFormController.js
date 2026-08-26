const svc = require("../../services/transaksi/voucherPembayaranFormService");

const getSupplier = async (req, res) => {
  try {
    const data = await svc.getSupplier(req.params.kode);
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const searchSupplier = async (req, res) => {
  try {
    const data = await svc.searchSupplier(req.query.search || "");
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getNotaDetail = async (req, res) => {
  try {
    const { kode } = req.params;
    const statusPpn = Number(req.query.statusPpn) || 0;
    const type = req.query.type || null; // ← tambah
    const data = await svc.getNotaDetail(kode, statusPpn, type);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const searchNota = async (req, res) => {
  try {
    const { type, supKode, search } = req.query;
    if (!type)
      return res.status(400).json({ success: false, message: "type wajib." });
    // supKode wajib kecuali BPG (tidak filter by supplier)
    if (!supKode && type !== "BPG")
      return res
        .status(400)
        .json({ success: false, message: "supKode wajib." });
    const data = await svc.searchNota(type, supKode || "", search || "");
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getDetailForm = async (req, res) => {
  try {
    const data = await svc.getDetailForm(decodeURIComponent(req.params.nomor));
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const save = async (req, res) => {
  try {
    const result = await svc.save(req.body, req.user.kode);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// ── Realisasi ─────────────────────────────────────────────────────────
const searchKodeBayar = async (req, res) => {
  try {
    const data = await svc.searchKodeBayar(req.query.search || "");
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getKodeBayar = async (req, res) => {
  try {
    const data = await svc.getKodeBayar(req.params.kode);
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const searchAccount = async (req, res) => {
  try {
    const data = await svc.searchAccount(req.query.search || "");
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchVoucherRealisasi = async (req, res) => {
  try {
    const data = await svc.searchVoucherRealisasi(
      req.query.search || "",
      req.query.excludeNomor || "",
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const loadVoucherRealisasiDetail = async (req, res) => {
  try {
    const data = await svc.loadVoucherRealisasiDetail(
      decodeURIComponent(req.params.vouNomor),
      req.query.currentNomor || "",
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getDetailFormRealisasi = async (req, res) => {
  try {
    const data = await svc.getDetailFormRealisasi(
      decodeURIComponent(req.params.nomor),
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const saveRealisasi = async (req, res) => {
  try {
    const result = await svc.saveRealisasi(req.body, req.user.kode);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const hapusRealisasi = async (req, res) => {
  try {
    await svc.hapusRealisasi(decodeURIComponent(req.params.nomor));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = {
  getSupplier,
  searchSupplier,
  getNotaDetail,
  searchNota,
  getDetailForm,
  save,
  // Realisasi
  searchKodeBayar,
  getKodeBayar,
  searchAccount,
  searchVoucherRealisasi,
  loadVoucherRealisasiDetail,
  getDetailFormRealisasi,
  saveRealisasi,
  hapusRealisasi,
};
