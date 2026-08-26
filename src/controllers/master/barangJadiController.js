const svc = require("../../services/master/barangJadiService");

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

const getKomposisi = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getKomposisi(req.params.kode) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getTemplateList = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getTemplateList() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveData = async (req, res) => {
  try {
    const username = req.user?.username || "ADMIN";
    const { items, ...data } = req.body;
    const result = await svc.saveBarangJadiWithKomposisi(data, items, username);
    res.json({ success: true, data: result, message: "Barang jadi berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(req.params.kode);
    res.json({ success: true, message: "Barang jadi berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getAll, getById, getKomposisi, getTemplateList, saveData, deleteData };