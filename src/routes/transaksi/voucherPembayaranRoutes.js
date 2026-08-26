const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/voucherPembayaranController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 30;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get(
  "/detail",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getBrowseDetail,
);
router.get(
  "/pending-all",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getBrowsePendingAll,
);
router.get(
  "/pending-all/detail",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getBrowseDetailPendingAll,
);
router.delete(
  "/:nomor",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteData,
);
router.get(
  "/:nomor/cek-pengajuan",
  verifyToken,
  checkPermission(menuId, "edit"),
  ctrl.cekPengajuan,
);
router.post(
  "/:nomor/pengajuan",
  verifyToken,
  checkPermission(menuId, "edit"),
  ctrl.requestPin5,
);
router.get(
  "/print/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getPrintData,
);

module.exports = router;
