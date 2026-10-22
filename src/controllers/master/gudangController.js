const svc = require("../../services/master/gudangService");

const getAll = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getCabang = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getCabang() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveData = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.saveData(req.body), message: "Berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(req.params.kode);
    res.json({ success: true, message: "Berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getAll, getCabang, saveData, deleteData };