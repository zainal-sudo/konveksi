const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/spkController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const menuId = 84; // SPK — sesuai tmenu.sql MEN_ID=84 (frmSPK)

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get("/detail-all", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowseDetailAll);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowseDetail);
// Close / update status SPK (PATCH supaya tidak dianggap "buat data baru"
// oleh proxy/log). Revisi 2026-10-05: memo tidak lagi jadi syarat close.
router.patch("/:nomor/close", verifyToken, checkPermission(menuId, "edit"), ctrl.closeStatus);
// Memo/catatan hasil produksi — hanya bisa disimpan kalau status CLOSED.
// Pakai permission "edit" yang sama dengan close supaya tidak perlu ada
// role baru di tmenu/permission.
router.patch("/:nomor/memo", verifyToken, checkPermission(menuId, "edit"), ctrl.updateMemo);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);
router.get("/komposisi/:brgKode", verifyToken, checkPermission(menuId, "view"), ctrl.getKomposisi);
// Kebutuhan bahan untuk satu SPK (komposisi barang jadi x jumlah target).
router.get("/kebutuhan-bahan/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getKebutuhanBahan);

module.exports = router;