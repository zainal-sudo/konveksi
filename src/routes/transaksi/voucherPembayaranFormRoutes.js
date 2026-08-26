const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/voucherPembayaranFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 30;

// Static routes DULU sebelum dynamic (:nomor)
router.get(
  "/supplier",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.searchSupplier,
);
router.get(
  "/supplier/:kode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getSupplier,
);
router.get(
  "/nota-detail/:kode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getNotaDetail,
);
router.get(
  "/search-nota",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.searchNota,
);
// ── Realisasi routes (static dulu sebelum /:nomor) ────────────────────
router.get(
  "/realisasi/kode-bayar",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.searchKodeBayar,
);
router.get(
  "/realisasi/kode-bayar/:kode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getKodeBayar,
);
router.get(
  "/realisasi/account",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.searchAccount,
);
router.get(
  "/realisasi/search-voucher",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.searchVoucherRealisasi,
);
router.get(
  "/realisasi/voucher/:vouNomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.loadVoucherRealisasiDetail,
);
router.get(
  "/realisasi/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailFormRealisasi,
);
router.post(
  "/realisasi/save",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.saveRealisasi,
);
router.delete(
  "/realisasi/:nomor",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.hapusRealisasi,
);
router.get(
  "/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailForm,
);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.save);

module.exports = router;
