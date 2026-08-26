const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/bpbController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 17; // sesuaikan menu ID

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetail);
module.exports = router;
