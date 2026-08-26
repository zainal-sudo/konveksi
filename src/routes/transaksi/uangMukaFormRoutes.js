const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/uangMukaFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 21;

router.get(
  "/account",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAccountOptions,
);
router.get(
  "/pengajuan",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getPengajuanOptions,
);
router.get(
  "/pengajuan/:pjhNomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailPengajuan,
);
router.get(
  "/supplier",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getSupplierOptions,
);
router.get(
  "/detail/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetailForm,
);
router.post(
  "/save",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.saveData,
);
router.get("/print/:nomor", verifyToken, ctrl.getPrintData);

module.exports = router;
