const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/dashboardController");
const { verifyToken } = require("../middleware/authMiddleware");

// Endpoint: GET /api/dashboard/summary
router.get("/summary", verifyToken, ctrl.getSummary);

// Endpoint: GET /api/dashboard/sales — widget penjualan (scope by cabang user)
router.get("/sales", verifyToken, ctrl.getSales);

module.exports = router;
