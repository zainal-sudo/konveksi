const express = require("express");
const router = express.Router();
const controller = require("../../controllers/laporan/persediaanController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const MENU_ID = "96"; // Sesuaikan Menu ID untuk Laporan Persediaan
router.get("/", verifyToken, checkPermission(MENU_ID, "view"), controller.getLaporan);

module.exports = router;