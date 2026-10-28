const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/spkDetailController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 84;

router.get("/kategori", verifyToken, checkPermission(menuId, "view"), ctrl.getKategoriList);

// ⬇️ BARU
router.get("/template/:prsKode", verifyToken, checkPermission(menuId, "view"), ctrl.getTemplateByKategori);

// Backfill tahap Master Proses yang belum masuk ke SPK lama (tahap terakhir
// tidak muncul di LHK karena tspk_dtl hanya di-generate saat SPK dibuat).
router.post("/sync/:nomor", verifyToken, checkPermission(menuId, "update"), ctrl.syncTahap);

router.get("/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getBySpk);
router.put("/:id", verifyToken, checkPermission(menuId, "update"), ctrl.update);

module.exports = router;