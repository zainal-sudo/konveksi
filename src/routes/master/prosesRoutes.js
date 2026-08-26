const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/prosesController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

// TODO: sesuaikan menuId ini dengan database hak akses (menu baru "Master Proses")
const menuId = 30;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get("/:kode", verifyToken, checkPermission(menuId, "view"), ctrl.getById);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
