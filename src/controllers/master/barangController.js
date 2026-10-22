const svc = require("../../services/master/barangService");
const kategoriSvc = require("../../services/master/kategoriService");
const jenisBarangSvc = require("../../services/master/jenisBarangService");
const gudangSvc = require("../../services/master/gudangService");
const supplierSvc = require("../../services/master/supplierService");
const rekeningSvc = require("../../services/master/rekeningService");

const getAll = async (req, res) => {
  try {
    const { search, ktgKode, jenisKode, isAktif } = req.query;
    const cabang = String(req.user?.cabang || "00");
    res.json({ success: true, data: await svc.getAll({ search, ktgKode, jenisKode, isAktif, cabang }) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getById(req.params.kode, String(req.user?.cabang || "00")) });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const getKomposisi = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getKomposisi(req.params.kode) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getBiayaLain = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getBiayaLain(req.params.kode) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /master/barang/form-refs?only=kategori,rekening
// Satu request untuk semua/sebagian dropdown form.
// Pakai allSettled + parameter "only" supaya retry dari frontend
// bisa fetch ULANG cuma yang gagal, bukan semua 5 query.
const getFormRefs = async (req, res) => {
  const only = req.query.only ? req.query.only.split(",") : null;
  const want = (key) => !only || only.includes(key);

  const tasks = {
    kategori: want("kategori") ? kategoriSvc.getAll(3) : Promise.resolve([]),
    jenisBarang: want("jenisBarang") ? jenisBarangSvc.getAll() : Promise.resolve([]),
    gudang: want("gudang") ? gudangSvc.getAll() : Promise.resolve([]),
    supplier: want("supplier") ? supplierSvc.getAll() : Promise.resolve([]),
    rekening: want("rekening") ? rekeningSvc.getAll() : Promise.resolve([]),
  };

  const keys = Object.keys(tasks);
  const results = await Promise.allSettled(keys.map((k) => tasks[k]));

  const pick = (r) => (r.status === "fulfilled" ? r.value : []);
  const failedKeys = keys.filter((k, i) => results[i].status === "rejected");

  const data = {};
  keys.forEach((k, i) => (data[k] = pick(results[i])));

  res.json({
    success: failedKeys.length === 0,
    partial: failedKeys.length > 0,
    failed: failedKeys,
    data,
  });
};

const saveData = async (req, res) => {
  try {
    const username = req.user?.username || "ADMIN";
    res.json({
      success: true,
      data: await svc.saveData(req.body, username),
      message: "Data barang berhasil disimpan.",
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(req.params.kode);
    res.json({ success: true, message: "Barang berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getAll, getById, getKomposisi, getBiayaLain, getFormRefs, saveData, deleteData };
