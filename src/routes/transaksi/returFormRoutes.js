const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/returFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 16; // Retur Pembelian

router.get("/supplier", verifyToken, checkPermission(menuId, "view"), ctrl.getSupplierOptions);
router.get("/rekening", verifyToken, checkPermission(menuId, "view"), ctrl.getRekeningOptions);
router.get("/barang", verifyToken, checkPermission(menuId, "view"), ctrl.getBarangOptions);
router.get("/gudang", verifyToken, checkPermission(menuId, "view"), ctrl.getGudangOptions);
router.get("/invoice", verifyToken, checkPermission(menuId, "view"), ctrl.getInvoiceOptions);
router.get("/invoice/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getInvoiceDetail);
router.get("/form/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
module.exports = router;