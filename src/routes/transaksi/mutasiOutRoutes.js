const express = require("express");
const router = express.Router();
const controller = require("../../controllers/transaksi/mutasiOutController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const MENU_ID = 31;

// Browse Header
router.get(
  "/",
  verifyToken,
  checkPermission(MENU_ID, "view"),
  controller.getBrowse,
);

// Browse Detail
router.get(
  "/detail/:nomor",
  verifyToken,
  checkPermission(MENU_ID, "view"),
  controller.getBrowseDetail,
);

// Delete Data
router.delete(
  "/:nomor",
  verifyToken,
  checkPermission(MENU_ID, "delete"),
  controller.deleteData,
);

// Pengajuan Perubahan Data (PIN)
router.post(
  "/request-pin",
  verifyToken,
  checkPermission(MENU_ID, "edit"),
  controller.requestPinEdit,
);

module.exports = router;
