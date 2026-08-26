const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/penyesuaianStokFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 27;

router.get("/gudang", verifyToken, checkPermission(menuId, "view"), ctrl.getGudang);
router.get("/barang/:gdgKode", verifyToken, checkPermission(menuId, "view"), ctrl.getBarangByGudang);
router.get("/form/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);

module.exports = router;
