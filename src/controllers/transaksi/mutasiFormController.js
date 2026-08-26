const svc = require("../../services/transaksi/mutasiFormService");
module.exports = {
  getGudang: async (req, res) => {
    try { res.json({ success: true, data: await svc.getGudang(req.query.search || "") }); } 
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  getBarang: async (req, res) => {
    try { 
      const { search, gdgKode } = req.query;
      res.json({ success: true, data: await svc.getBarang(search || "", gdgKode || "") }); 
    } 
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  getDetailForm: async (req, res) => {
    try { res.json({ success: true, data: await svc.getDetailForm(req.params.nomor) }); } 
    catch (e) { res.status(404).json({ success: false, message: e.message }); }
  },
  saveData: async (req, res) => {
    try { res.json({ success: true, message: "Mutasi berhasil disimpan.", data: await svc.saveData(req.body, req.user) }); } 
    catch (e) { res.status(400).json({ success: false, message: e.message }); }
  },
  
};