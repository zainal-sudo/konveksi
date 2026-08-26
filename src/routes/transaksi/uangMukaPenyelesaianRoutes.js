const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/uangMukaPenyelesaianController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 21;

router.get(
  "/form/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getFormData,
);
router.get(
  "/account",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAccountOptions,
);
router.get(
  "/account/:kode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAccountByKode,
);
router.get(
  "/cost-center",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getCostCenterOptions,
);
router.get(
  "/dc/:cckode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDcOptions,
);
router.post(
  "/save",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.saveData,
);
router.post(
  "/supplier",
  verifyToken,
  checkPermission(menuId, "edit"),
  ctrl.createSupplier,
);

// ── Routes Bantuan Pencarian (F1 - F5) ────────────────────────────────

router.get(
  "/pengajuan-ga",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getListPengajuanGA,
);
router.get(
  "/pengajuan-ga/detail/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailPengajuanGA,
);

router.get(
  "/po-external",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getListPoExternal,
);

router.get(
  "/voucher",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getListVoucher,
);

router.get(
  "/permintaan-garmen",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getListPermintaanGarmen,
);
router.get(
  "/permintaan-garmen/detail/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailPermintaanGarmen,
);

router.get(
  "/invoice-garmen",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getListInvoiceGarmen,
);
router.get(
  "/invoice-garmen/detail/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailInvoiceGarmen,
);

module.exports = router;
