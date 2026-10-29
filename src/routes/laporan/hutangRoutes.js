const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/laporan/hutangController");
const { verifyToken } = require("../../middleware/authMiddleware");

// Tidak ada MENU_ID — cukup verifyToken
router.get("/", verifyToken, ctrl.getLaporan);

module.exports = router;
