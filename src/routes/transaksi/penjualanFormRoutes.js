const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/penjualanFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 33;

router.get("/customer", verifyToken, checkPermission(menuId, "view"), ctrl.getCustomerOptions);
router.get("/barang", verifyToken, checkPermission(menuId, "view"), ctrl.getBarangOptions);
router.get("/form/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);

module.exports = router;
