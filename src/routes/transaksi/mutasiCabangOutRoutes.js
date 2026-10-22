const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/mutasiCabangController");
const { verifyToken } = require("../../middleware/authMiddleware");
const menuId = 13; // Mutasi antar cabang (dummy hak per module baru)

router.get("/", verifyToken, ctrl.browseOut);
router.get("/detail/:nomor", verifyToken, ctrl.detailOut);

module.exports = router;
