const express = require("express");
const router = express.Router();
const controller = require("../../controllers/transaksi/mutasiController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");
const MENU_ID = "13"; // Sesuaikan dengan Menu ID Mutasi Gudang Anda

router.get("/", verifyToken, checkPermission(MENU_ID, "view"), controller.getBrowse);
router.get("/detail/:nomor", verifyToken, checkPermission(MENU_ID, "view"), controller.getDetail);
router.delete("/:nomor", verifyToken, checkPermission(MENU_ID, "delete"), controller.deleteData);
// Route
router.put("/realisasi/:nomor", verifyToken, checkPermission(MENU_ID, "edit"), controller.realisasiData);
module.exports = router;