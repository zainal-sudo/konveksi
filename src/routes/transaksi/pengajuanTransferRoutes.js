const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/pengajuanTransferController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 28;

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
router.get(
  "/status/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getStatus,
);
router.delete(
  "/:nomor",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteData,
);

module.exports = router;
