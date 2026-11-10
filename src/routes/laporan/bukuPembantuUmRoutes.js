const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/laporan/bukuPembantuUmController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const MENU_ID = 34; // tmenu: 34 = Buku Pembantu Uang Muka
router.get(
  "/",
  verifyToken,
  checkPermission(MENU_ID, "view"),
  ctrl.getLaporan,
);

module.exports = router;
