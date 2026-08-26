const svc = require("../../services/transaksi/bayarSupplierService");

const getSupplierOptions = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getSupplierOptions(req.query.search || "") });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getRekeningOptions = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getRekeningOptions(req.query.search || "") });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getInitData = async (req, res) => {
  try {
    // Catatan: nomor ini cuma PREVIEW untuk ditampilkan di form. Nomor
    // FINAL yang benar-benar dipakai digenerate ulang di server saat
    // tombol simpan ditekan (lihat bayarSupplierService.saveData), supaya
    // tidak collision kalau ada user lain yang submit lebih dulu.
    const { nomor: nomorOtomatis } = await svc.generateNomorBukti();
    res.json({ success: true, data: { nomorOtomatis } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getInvoiceHutang = async (req, res) => {
  try {
    const { supKode } = req.params;
    if (!supKode) throw new Error("Supplier belum dipilih.");
    
    const rows = await svc.getInvoiceHutang(supKode);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getAllHistory = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    res.json({ success: true, data: await svc.getAllHistory(startDate, endDate) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deleteTransaksi = async (req, res) => {
  try {
    await svc.deleteTransaksi(req.params.nomor);
    res.json({ success: true, message: "Transaksi pembayaran berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
const saveData = async (req, res) => {
  try {
    const result = await svc.saveData(req.body);
    res.json({ success: true, data: result, message: "Transaksi Pembayaran berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
const getDetailForm= async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getDetailForm(req.params.nomor) });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const getDetail= async (req, res) => {
  try { res.json({ success: true, data: await svc.getDetail(req.params.nomor) }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

module.exports = {
  getSupplierOptions,
  getRekeningOptions,
  getInitData,
  getInvoiceHutang,
  getAllHistory,
  deleteTransaksi,
  saveData,
  getDetailForm,
  getDetail
};