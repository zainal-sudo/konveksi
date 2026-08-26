const svc = require("../../services/tools/masterUserFormService");

const getCabangList = async (req, res) => {
  try {
    const data = await svc.getCabangList();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getAllMenus = async (req, res) => {
  try {
    const data = await svc.getAllMenus();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetail = async (req, res) => {
  try {
    const data = await svc.getDetail(req.params.kode);
    if (!data)
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const save = async (req, res) => {
  try {
    const { isEdit, ...data } = req.body;
    const result = await svc.save(data, isEdit);
    res.json({ success: true, data: result, message: "Berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getCabangList, getAllMenus, getDetail, save };
