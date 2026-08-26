const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/supplierController"); // Mengarah ke controller supplier
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

// Sesuaikan menuId ini dengan ID Master Supplier yang terdaftar di database Anda (contoh: 9)
const menuId = 10; 

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get(
  "/:kode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getById,
);
router.post(
  "/save",
  verifyToken,
  checkPermission(menuId, "insert"), // Menggunakan "insert" (untuk edit, otentikasi internal dikendalikan di dalam saveData)
  ctrl.saveData,
);
router.delete(
  "/:kode",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteData,
);

module.exports = router;