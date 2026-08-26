const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/dashboardController");
const { verifyToken } = require("../middleware/authMiddleware");

// Endpoint: GET /api/dashboard/summary
router.get("/summary", verifyToken, ctrl.getSummary);

module.exports = router;
