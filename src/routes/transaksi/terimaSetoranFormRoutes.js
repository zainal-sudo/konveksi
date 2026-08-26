const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/terimaSetoranFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 29;

// Load form data
router.get(
  "/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getForm,
);

// Save (verifikasi / batalkan verifikasi)
router.post(
  "/save",
  verifyToken,
  checkPermission(menuId, "edit"),
  ctrl.saveForm,
);

module.exports = router;
