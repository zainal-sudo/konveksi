const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/bpbFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 31;

router.get("/po-options",        verifyToken, checkPermission(menuId, "view"),   ctrl.getPoOptions);
router.get("/po-detail/:nomor",verifyToken, checkPermission(menuId, "view"),   ctrl.getPoDetail);
router.get("/gudang",            verifyToken, checkPermission(menuId, "view"),   ctrl.getGudang);
router.get("/form/:nomor",       verifyToken, checkPermission(menuId, "view"),   ctrl.getDetailForm);
router.post("/save",             verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
module.exports = router;
