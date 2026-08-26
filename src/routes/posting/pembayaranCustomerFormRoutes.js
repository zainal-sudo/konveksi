const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/posting/pembayaranCustomerFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 51;

// Load data dari kencanaprint.terima_bayar_debet
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
