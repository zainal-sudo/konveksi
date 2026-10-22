const svc = require("../../services/transaksi/bayarCustomerService");

const getInitData = async (req, res) => {
  try {
    const nomorOtomatis = await svc.generateNomorBukti(
      req.user?.cabang || "01",
    );
    res.json({ success: true, data: { nomorOtomatis } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const searchCustomer = async (req, res) => {
  try {
    const rows = await svc.searchCustomer(req.query.search || "");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getRekeningOptions = async (req, res) => {
  try {
    const rows = await svc.getRekeningOptions(req.query.search || "");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getInvoicePiutang = async (req, res) => {
  try {
    const { cusKode } = req.params;
    if (!cusKode) throw new Error("Customer belum dipilih.");
    const rows = await svc.getInvoicePiutang(cusKode);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getAllHistory = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    res.json({
      success: true,
      data: await svc.getAllHistory(startDate, endDate),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deleteTransaksi = async (req, res) => {
  try {
    await svc.deleteTransaksi(req.params.nomor);
    res.json({
      success: true,
      message: "Transaksi pembayaran berhasil dihapus.",
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const saveData = async (req, res) => {
  try {
    const result = await svc.saveData(req.body, req.user);
    let message = "Transaksi pembayaran berhasil disimpan.";
    if (result?.journalError)
      message += ` PERINGATAN: jurnal gagal dibuat (${result.journalError})`;
    res.json({
      success: true,
      data: result,
      message,
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const getDetailForm = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetailForm(req.params.nomor),
    });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
};

const getDetail = async (req, res) => {
  try {
    res.json({
      success: true,
      data: await svc.getDetail(req.params.nomor),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getInitData,
  searchCustomer,
  getRekeningOptions,
  getInvoicePiutang,
  getAllHistory,
  deleteTransaksi,
  saveData,
  getDetailForm,
  getDetail,
};
