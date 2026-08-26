const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/penjualanController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 33; // Set ID Menu khusus untuk Penjualan Kasir

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAllHistory);
router.get("/detail/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailHistory);
router.get("/init", verifyToken, checkPermission(menuId, "view"), ctrl.getInitData);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.get("/customer", verifyToken, checkPermission(menuId, "view"), ctrl.getCustomer);
router.get("/pending-list", verifyToken, checkPermission(menuId, "view"), ctrl.getPendingList);
router.post("/pending-save", verifyToken, checkPermission(menuId, "insert"), ctrl.savePending);
router.post("/pending-take", verifyToken, checkPermission(menuId, "insert"), ctrl.takePending);

module.exports = router;