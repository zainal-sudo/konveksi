const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/customerController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

// Gunakan menuId khusus untuk Customer (misal: 13)
const menuId = 13;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get("/:kode", verifyToken, checkPermission(menuId, "view"), ctrl.getById);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;