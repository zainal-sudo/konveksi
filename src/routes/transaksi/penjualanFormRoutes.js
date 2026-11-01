const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/penjualanFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 22;;

router.get("/customer", verifyToken, checkPermission(menuId, "view"), ctrl.getCustomerOptions);
router.get("/barang", verifyToken, checkPermission(menuId, "view"), ctrl.getBarangOptions);
router.get("/form/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.post("/pending-save", verifyToken, checkPermission(menuId, "insert"), ctrl.savePending);
router.get("/pending-list", verifyToken, checkPermission(menuId, "view"), ctrl.getPendingList);
router.post("/pending-take", verifyToken, checkPermission(menuId, "insert"), ctrl.takePending);

module.exports = router;
