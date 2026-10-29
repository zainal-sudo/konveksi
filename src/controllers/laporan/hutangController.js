const svc = require("../../services/laporan/hutangService");

const getLaporan = async (req, res) => {
  try {
    const { tanggal } = req.query;
    if (!tanggal)
      return res
        .status(400)
        .json({ success: false, message: "tanggal wajib diisi." });

    const data = await svc.getHutang(tanggal);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getLaporan };
