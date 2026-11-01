const express = require("express");
const router = express.Router();
const { verifyToken } = require("../../middleware/authMiddleware");
const ctrl = require("../../controllers/laporan/harianController");

router.get("/", verifyToken, ctrl.getBrowse);
router.get("/print", verifyToken, ctrl.getPrintData);

module.exports = router;
