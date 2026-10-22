const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/laporan/penjualanItemController");
const { verifyToken } = require("../../middleware/authMiddleware");

router.get("/", verifyToken, ctrl.getPenjualanItem);

module.exports = router;
