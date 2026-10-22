const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/mutasiCabangController");
const { verifyToken } = require("../../middleware/authMiddleware");

router.get("/", verifyToken, ctrl.browseIn);
router.get("/detail/:nomor", verifyToken, ctrl.detailIn);

module.exports = router;
