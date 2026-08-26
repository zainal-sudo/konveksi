const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/jenisPembayaranController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 8;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post(
  "/save",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.saveData,
);
router.delete(
  "/:nama",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteData,
);

module.exports = router;
