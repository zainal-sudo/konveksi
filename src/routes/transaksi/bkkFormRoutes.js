const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/bkkFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 22;

router.get(
  "/account",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAccountOptions,
);
router.get(
  "/account-all",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAccountAll,
);
router.get(
  "/keterangan",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getKeteranganOptions,
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
