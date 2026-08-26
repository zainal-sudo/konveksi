const svc = require("../../services/transaksi/bpbFormService");

module.exports = {
  getPoOptions: async (req, res) => {
    try { res.json({ success: true, data: await svc.getPoOptions(req.query.search || "") }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  getPoDetail: async (req, res) => {
    try { res.json({ success: true, data: await svc.getPoDetail(req.params.nomor) }); }
    catch (e) { res.status(404).json({ success: false, message: e.message }); }
  },
  getGudang: async (req, res) => {
    try { res.json({ success: true, data: await svc.getGudang(req.query.search || "") }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  getDetailForm: async (req, res) => {
    try { res.json({ success: true, data: await svc.getDetailForm(req.params.nomor) }); }
    catch (e) { res.status(404).json({ success: false, message: e.message }); }
  },
  saveData: async (req, res) => {
    try {
      res.json({ success: true, data: await svc.saveData(req.body, req.user), message: "BPB berhasil disimpan." });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  },
};
