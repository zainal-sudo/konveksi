const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/rekeningController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 6; // Ganti sesuai ID Menu Rekening Anda

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get("/:kode", verifyToken, checkPermission(menuId, "view"), ctrl.getById);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;