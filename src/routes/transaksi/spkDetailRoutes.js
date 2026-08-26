const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/spkDetailController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 60;

// ⚠️ URUTAN PENTING: route spesifik/statis harus di atas "/:nomor",
// kalau tidak, Express akan menganggap "kategori" atau "proses-oleh-barang"
// sebagai nilai param :nomor.
router.get("/kategori", verifyToken, checkPermission(menuId, "view"), ctrl.getKategoriList);
router.get("/proses-oleh-barang/:brgKode", verifyToken, checkPermission(menuId, "view"), ctrl.getProsesByBarang);
router.get("/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getBySpk);
router.put("/:id", verifyToken, checkPermission(menuId, "insert"), ctrl.update);

module.exports = router;