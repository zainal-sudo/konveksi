const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/terimaSetoranController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 29;

// Dropdown cabang (dari retail.tgudang)
router.get(
  "/cabang",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getCabang,
);

router.get(
  "/pending-all",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getBrowsePendingAll,
);

// Browse header
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);

// Browse detail (untuk expand row & export detail)
router.get(
  "/detail",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getBrowseDetail,
);

module.exports = router;
