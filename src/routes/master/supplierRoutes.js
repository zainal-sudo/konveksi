const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/supplierController"); // Mengarah ke controller supplier
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

// menuId = 8 'Supplier' (tmenu baru)
const menuId = 8;

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