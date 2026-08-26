const svc = require("../../services/transaksi/rekonsiliasiBankService");

const getBrowse = async (req, res) => {
  try {
    const { tanggal } = req.query;
    if (!tanggal)
      return res
        .status(400)
        .json({ success: false, message: "Tanggal wajib diisi." });
    const data = await svc.getBrowse(tanggal);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    const { rekKode, tanggal } = req.query;
    if (!rekKode || !tanggal)
      return res
        .status(400)
        .json({ success: false, message: "rekKode dan tanggal wajib." });
    await svc.deleteData(rekKode, tanggal);
    res.json({ success: true, message: "Data rekonsiliasi berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getValidasi = async (req, res) => {
  try {
    const { rekKode, tanggal } = req.query;
    if (!rekKode || !tanggal)
      return res
        .status(400)
        .json({ success: false, message: "rekKode dan tanggal wajib." });
    const data = await svc.getValidasi(rekKode, tanggal);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveValidasi = async (req, res) => {
  try {
    const { rekKode, tanggal, saldoKoran } = req.body;
    if (!rekKode || !tanggal || saldoKoran === undefined)
      return res.status(400).json({
        success: false,
        message: "rekKode, tanggal, saldoKoran wajib.",
      });
    await svc.saveValidasi(rekKode, tanggal, Number(saldoKoran), req.user);
    res.json({ success: true, message: "Validasi bank berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getRekon = async (req, res) => {
  try {
    const { rekKode, tanggal } = req.query;
    if (!rekKode || !tanggal)
      return res
        .status(400)
        .json({ success: false, message: "rekKode dan tanggal wajib." });
    const data = await svc.getRekon(rekKode, tanggal);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveRekon = async (req, res) => {
  try {
    const { rekKode, tanggal, saldoBuku, saldoKoran, detail } = req.body;
    if (!rekKode || !tanggal)
      return res
        .status(400)
        .json({ success: false, message: "rekKode dan tanggal wajib." });
    await svc.saveRekon(
      rekKode,
      tanggal,
      saldoBuku,
      saldoKoran,
      detail,
      req.user,
    );
    res.json({ success: true, message: "Rekonsiliasi berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = {
  getBrowse,
  deleteData,
  getValidasi,
  saveValidasi,
  getRekon,
  saveRekon,
};
