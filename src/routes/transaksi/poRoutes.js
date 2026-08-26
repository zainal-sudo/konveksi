const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/poController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 30; // ⚠️ Samakan dengan MENU_ID frontend ("15") supaya user non-admin gak ketolak

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowseDetail);
router.get("/print/:nomor", verifyToken, checkPermission("print"), ctrl.getPrintData);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);
router.patch("/:nomor/status", ctrl.updateStatus);

module.exports = router;