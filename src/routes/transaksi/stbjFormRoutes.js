const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/stbjFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 40; // Sesuaikan menu ID STBJ Anda

// Route untuk lookup modal & form data
router.get("/gudang", verifyToken, ctrl.getGudang);
router.get("/barang", verifyToken, ctrl.getBarang);
router.get("/form/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);

// Route simpan (create & update)
router.post("/save", verifyToken, checkPermission(menuId, "save"), ctrl.saveData);

module.exports = router;