const svc = require("../../services/transaksi/returFormService");
module.exports = {
  getSupplierOptions: async (req, res) => {
    try { res.json({ success: true, data: await svc.getSupplierOptions(req.query.search || "") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  getRekeningOptions: async (req, res) => {
    try { res.json({ success: true, data: await svc.getRekeningOptions(req.query.search || "") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  getBarangOptions: async (req, res) => {
    try { res.json({ success: true, data: await svc.getBarangOptions(req.query.search || "") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  getGudangOptions: async (req, res) => {
    try { 
      const rows = await svc.getGudangOptions(req.query.search || ""); 
      res.json({ success: true, data: rows }); 
    } catch (e) { 
      res.status(500).json({ success: false, message: e.message }); 
    }
  },
  getInvoiceOptions: async (req, res) => {
    try { res.json({ success: true, data: await svc.getInvoiceOptions(req.query.search || "") }); } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  },
  // ✅ FIX: terima query ?excludeRet=NOMOR supaya pas mode edit, qtySisa tidak
  // mengurangi qty retur ini sendiri (kalau tidak, buka form edit retur bisa
  // langsung bikin qtySisa keliru lebih kecil dari harusnya).
  getInvoiceDetail: async (req, res) => {
  try {
    const excludeRet = req.query.excludeRet || null;
    res.json({ success: true, data: await svc.getInvoiceDetail(req.params.nomor, excludeRet) });
  } catch (e) {
    console.error("❌ CONTROLLER getInvoiceDetail ERROR:", e);
    res.status(500).json({ success: false, message: e.message });
  }
},
  getDetailForm: async (req, res) => {
    try { res.json({ success: true, data: await svc.getDetailForm(req.params.nomor) }); } catch (e) { res.status(404).json({ success: false, message: e.message }); }
  },
  saveData: async (req, res) => {
    try { res.json({ success: true, data: await svc.saveData(req.body, req.user), message: "Retur Berhasil disimpan." }); } catch (e) { res.status(400).json({ success: false, message: e.message }); }
  }
};