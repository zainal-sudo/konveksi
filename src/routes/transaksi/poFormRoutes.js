const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/poFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 15; // ⚠️ Disamakan dengan MENU_ID frontend ("15") — sebelumnya 30, beda dari poRoutes.js dan frontend

router.get("/supplier", verifyToken, checkPermission(menuId, "view"), ctrl.getSupplierOptions);
router.get("/barang", verifyToken, checkPermission(menuId, "view"), ctrl.getBarangOptions);
router.get("/form/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
module.exports = router;