const express = require("express");
const router = express.Router();
const controller = require("../../controllers/laporan/persediaanController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const MENU_ID = 28; // tmenu baru: 28 = Lap Persediaan
router.get("/", verifyToken, checkPermission(MENU_ID, "view"), controller.getLaporan);

module.exports = router;