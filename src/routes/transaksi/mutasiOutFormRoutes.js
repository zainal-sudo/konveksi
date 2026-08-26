const express = require("express");
const router = express.Router();
const controller = require("../../controllers/transaksi/mutasiOutFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const MENU_ID = 31;

// Static routes — harus di atas /:nomor
router.get("/search-barang", verifyToken, controller.searchBarang);
router.get(
  "/search-permintaan-finance",
  verifyToken,
  controller.searchPermintaanFinance,
);
router.get(
  "/detail-permintaan-finance",
  verifyToken,
  controller.getDetailPermintaanFinance,
);

// Detail untuk load form edit
router.get(
  "/:nomor",
  verifyToken,
  checkPermission(MENU_ID, "view"),
  controller.getDetail,
);

// Save (insert/update)
router.post(
  "/",
  verifyToken,
  checkPermission(MENU_ID, "insert"),
  controller.save,
);

module.exports = router;
