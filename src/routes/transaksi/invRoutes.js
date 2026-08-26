const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/invController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
// const { checkPermission } = require("../../middleware/auth"); // sesuaikan punya kamu

const menuId = 12; // ⚠️ SAMAKAN dengan ID menu "Invoice" di tabel thakuser/menu kamu

router.get("/", ctrl.getBrowse);
router.get("/export-detail", ctrl.exportDetail);
router.get("/detail/:nomor", ctrl.getDetail);
router.get("/print/:nomor", verifyToken, checkPermission("print"), ctrl.getPrintData);
router.delete("/:nomor", ctrl.deleteData);
// Route PATCH /:nomor/status-bayar (tandai lunas manual) sengaja dihapus --
// lihat catatan di invService.js.

module.exports = router;