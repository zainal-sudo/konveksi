const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/jenisBarangController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 15; // sesuaikan dengan record menu "Jenis Barang" di tmenu

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get("/:kode", verifyToken, checkPermission(menuId, "view"), ctrl.getById);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;