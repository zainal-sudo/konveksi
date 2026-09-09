const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/penjualanController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 33;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowseDetail);
router.get("/print/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getPrintData);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);
router.patch("/:nomor/status", verifyToken, checkPermission(menuId, "update"), ctrl.updateStatus);

module.exports = router;
