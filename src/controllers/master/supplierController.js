const svc = require("../../services/master/supplierService");

const getAll = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getById(req.params.kode) });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const saveData = async (req, res) => {
  try {
    // Mengambil username dari auth session middleware (sesuaikan jika di backend Anda menggunakan properti lain seperti req.user.username)
    const username = req.user?.username || "ADMIN"; 
    res.json({
      success: true,
      data: await svc.saveData(req.body, username),
      message: "Data supplier berhasil disimpan.",
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(req.params.kode);
    res.json({ success: true, message: "Supplier berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getAll, getById, saveData, deleteData };