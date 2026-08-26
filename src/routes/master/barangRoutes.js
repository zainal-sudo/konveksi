const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/barangController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 14;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get("/form-refs", verifyToken, checkPermission(menuId, "view"), ctrl.getFormRefs);
router.get("/:kode/komposisi", verifyToken, checkPermission(menuId, "view"), ctrl.getKomposisi);
router.get("/:kode/biaya-lain", verifyToken, checkPermission(menuId, "view"), ctrl.getBiayaLain);
router.get("/:kode", verifyToken, checkPermission(menuId, "view"), ctrl.getById);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
