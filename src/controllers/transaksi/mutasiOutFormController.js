const service = require("../../services/transaksi/mutasiOutFormService");

const getDetail = async (req, res) => {
  try {
    const data = await service.getDetail(req.params.nomor);
    if (!data)
      return res
        .status(404)
        .json({ success: false, message: "Data tidak ditemukan." });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchBarang = async (req, res) => {
  try {
    const data = await service.searchBarang(req.query);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const save = async (req, res) => {
  try {
    const { isNewMode, data } = req.body;
    const userKode = req.user?.kode || "ADMIN";
    const userBagian = req.user?.bagian || "FINANCE";

    if (!data.CabangTujuan)
      return res
        .status(400)
        .json({ success: false, message: "Cabang Tujuan harus dipilih." });

    if (!isNewMode && ["WAIT", "TOLAK"].includes(data.StatusEdit))
      return res.status(400).json({
        success: false,
        message: "Transaksi terkunci. Minta approve untuk bisa mengubah data.",
      });

    const nomor = await service.save(data, userKode, userBagian, isNewMode);
    res.json({
      success: true,
      message: "Mutasi Out berhasil disimpan.",
      nomor,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchPermintaanFinance = async (req, res) => {
  try {
    const { jenis, cabangTujuan, search } = req.query;
    const data = await service.searchPermintaanFinance(
      jenis,
      cabangTujuan,
      search,
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetailPermintaanFinance = async (req, res) => {
  try {
    const { noPermintaan, cabangAsal, nomorMso } = req.query;
    const data = await service.getDetailPermintaanFinance(
      noPermintaan,
      cabangAsal,
      nomorMso,
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getDetail,
  searchBarang,
  save,
  searchPermintaanFinance,
  getDetailPermintaanFinance,
};
