const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/spkController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 60;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowseDetail);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;