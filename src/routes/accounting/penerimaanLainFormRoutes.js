const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/accounting/penerimaanLainFormController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 23;

router.get("/get-max-nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getMaxNomor);
router.get("/search-account", verifyToken, checkPermission(menuId, "view"), ctrl.searchAccount);
router.get("/account", verifyToken, checkPermission(menuId, "view"), ctrl.getAccountByKode);
router.get("/cost-center", verifyToken, checkPermission(menuId, "view"), ctrl.searchCostCenter);
router.get("/customer", verifyToken, checkPermission(menuId, "view"), ctrl.searchCustomer);
router.get("/cek-biaya", verifyToken, checkPermission(menuId, "view"), ctrl.cekBiaya);
router.get("/cek-periode", verifyToken, checkPermission(menuId, "view"), ctrl.cekPeriode);
router.get("/:nomor", verifyToken, checkPermission(menuId, "view"), ctrl.getDetailForm);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);

module.exports = router;
