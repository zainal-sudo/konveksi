const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/kategoriController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

// Sesuaikan menuId ini dengan database hak akses retail Anda (contoh: 10)
const menuId = 11; 

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get("/:kode", verifyToken, checkPermission(menuId, "view"), ctrl.getById);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;