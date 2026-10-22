const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/bayarCustomerController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

// Pembayaran Customer (entry dari minimarket) = menu 51 konveksi
const menuId = 51;

router.get("/init", verifyToken, checkPermission(menuId, "view"), ctrl.getInitData);
router.get(
  "/customer-search",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.searchCustomer,
);
router.get(
  "/rekening-search",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getRekeningOptions,
);
router.get(
  "/invoice-piutang/:cusKode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getInvoicePiutang,
);
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAllHistory);
router.delete(
  "/:nomor",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteTransaksi,
);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.get("/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.get(
  "/detail/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetail,
);

module.exports = router;
