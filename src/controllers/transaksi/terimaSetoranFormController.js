const svc = require("../../services/transaksi/terimaSetoranFormService");

// GET /form/:nomor
const getForm = async (req, res) => {
  try {
    const data = await svc.getForm(decodeURIComponent(req.params.nomor));
    res.json({ success: true, data });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

// POST /form/save
const saveForm = async (req, res) => {
  try {
    const { nomor, diVerifikasi, tglVerifikasi, detail2 } = req.body;
    if (!nomor) {
      return res.status(400).json({ success: false, message: "Nomor wajib diisi." });
    }
    if (!Array.isArray(detail2)) {
      return res.status(400).json({ success: false, message: "detail2 harus array." });
    }
    // userLogin dari JWT — dipakai sebagai fsk_userv saat verifikasi
    const userLogin = req.user?.kode || req.user?.username || "";
    await svc.saveForm(nomor, { diVerifikasi, tglVerifikasi, detail2 }, userLogin);
    res.json({ success: true, message: "Data berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getForm, saveForm };