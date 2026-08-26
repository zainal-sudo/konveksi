const svc = require("../../services/tools/masterUserService");

const getBrowse = async (req, res) => {
  try {
    const data = await svc.getBrowse();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    await svc.deleteUser(req.params.kode);
    res.json({ success: true, message: "User berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getBrowse, deleteUser };
