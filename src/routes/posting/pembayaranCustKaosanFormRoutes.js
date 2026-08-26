const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/posting/pembayaranCustKaosanFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 52;

// Dropdown cabang
router.get(
  "/cabang",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getCabang,
);

// Load data posting
router.get(
  "/",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDataPosting,
);

// Eksekusi posting
router.post(
  "/posting",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.doPosting,
);

module.exports = router;
