const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/stbjController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 40; // Sesuaikan ID menu STBJ Anda

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetail);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;