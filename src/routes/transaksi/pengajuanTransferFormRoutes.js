const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/pengajuanTransferFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 28;

router.get(
  "/account",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAccountOptions,
);
router.get(
  "/supplier",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getSupplierOptions,
);
router.get(
  "/supplier/:kode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getSupplierDetail,
);
router.get(
  "/voucher",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getVoucherOptions,
);
router.get(
  "/po-external",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getPoExternalOptions,
);
router.get(
  "/petty-cash",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getPettyCashOptions,
);
router.get(
  "/account-all",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAccountAll,
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
router.get(
  "/form/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailForm,
);
router.get(
  "/print/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getPrintData,
);
router.post(
  "/save",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.saveData,
);

module.exports = router;
