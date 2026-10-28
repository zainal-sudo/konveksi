const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/spkFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 84; // SPK — sesuai tmenu.sql MEN_ID=84 (frmSPK)

router.get("/init", verifyToken, checkPermission(menuId, "view"), ctrl.getInitData);
router.get("/barang", verifyToken, checkPermission(menuId, "view"), ctrl.getBarangOptions);
router.get("/customer", verifyToken, checkPermission(menuId, "view"), ctrl.getCustomerOptions);
router.get("/form/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);

module.exports = router;