const express = require("express");
const router = express.Router();
const controller = require("../../controllers/transaksi/mutasiFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const MENU_ID = "13"; // Sesuaikan dengan Menu ID Mutasi Gudang Anda

router.get("/gudang", verifyToken, checkPermission(MENU_ID, "view"), controller.getGudang);
router.get("/barang", verifyToken, checkPermission(MENU_ID, "view"), controller.getBarang);
router.get("/form/:nomor", verifyToken, checkPermission(MENU_ID, "view"), controller.getDetailForm);
router.post("/save", verifyToken, checkPermission(MENU_ID, "save"), controller.saveData);

module.exports = router;