const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/returController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 16; // ✅ Retur Pembelian (MEN_ID 16 di tmenu, bukan 19)

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowseDetail);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);
module.exports = router;