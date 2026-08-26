const express = require("express");
const router = express.Router();
const controller = require("../controllers/lookupController");
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/supplier", verifyToken, controller.getSupplier);
router.get("/user",     verifyToken, controller.getUser);

module.exports = router;
