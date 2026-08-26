const svc = require("../../services/master/kategoriService");

// GET /master/kategori?tingkat=1
// GET /master/kategori?tingkat=2&parent=1      -> sub kategori di bawah Departemen "1"
// GET /master/kategori?tingkat=3&parent=1.1    -> kategori di bawah Sub Kategori "1.1"
const getAll = async (req, res) => {
  try {
    const { tingkat, parent } = req.query;
    res.json({ success: true, data: await svc.getAll(tingkat, parent) });
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
    res.json({
      success: true,
      data: await svc.saveData(req.body),
      message: "Kategori berhasil disimpan.",
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(req.params.kode);
    res.json({ success: true, message: "Kategori berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getAll, getById, saveData, deleteData };