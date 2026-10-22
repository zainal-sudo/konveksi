const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/mutasiCabangController");
const { verifyToken } = require("../../middleware/authMiddleware");

router.get("/nomor", verifyToken, ctrl.nomorOut);
router.get("/cabang", verifyToken, ctrl.cabangList);
router.get("/gudang", verifyToken, ctrl.gudangOut);
router.get("/sku", verifyToken, ctrl.searchSKU);
router.get("/form/:nomor", verifyToken, ctrl.formOut);
router.post("/save", verifyToken, ctrl.saveOut);

module.exports = router;
