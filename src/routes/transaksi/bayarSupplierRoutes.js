const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/bayarSupplierController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 53; // Sesuaikan dengan ID Menu Pembayaran Supplier Anda

router.get("/supplier", verifyToken, checkPermission(menuId, "view"), ctrl.getSupplierOptions);
router.get("/rekening", verifyToken, checkPermission(menuId, "view"), ctrl.getRekeningOptions);
router.get("/init", verifyToken, checkPermission(menuId, "view"), ctrl.getInitData);
router.get("/invoice-hutang/:supKode", verifyToken, checkPermission(menuId, "view"), ctrl.getInvoiceHutang);
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAllHistory);
router.delete("/:nomor", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteTransaksi);
router.post("/save",             verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.get("/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetail);
module.exports = router;