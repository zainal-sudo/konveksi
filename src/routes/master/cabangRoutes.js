const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/cabangController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 17; // Sesuaikan ID menu Cabang Abang
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;