const router = require("express").Router();
const ctrl = require("../../controllers/transaksi/mutasiCabangController");
const { verifyToken } = require("../../middleware/authMiddleware");

router.get("/nomor", verifyToken, ctrl.nomorIn);
router.get("/cabang", verifyToken, ctrl.cabangList);
router.get("/gudang", verifyToken, ctrl.gudangIn);
router.get("/muout", verifyToken, ctrl.searchMutasiOut);
router.get("/load", verifyToken, ctrl.loadDataMutasi);
router.get("/form/:nomor", verifyToken, ctrl.formIn);
router.post("/save", verifyToken, ctrl.saveIn);

module.exports = router;
