const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/gudangController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 16; // Pastikan ID ini terdaftar di tabel menu Abang
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;