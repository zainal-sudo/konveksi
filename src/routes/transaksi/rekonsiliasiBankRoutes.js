const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/rekonsiliasiBankController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 27;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.delete(
  "/",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteData,
);
router.get(
  "/validasi",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getValidasi,
);
router.post(
  "/validasi",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.saveValidasi,
);
router.get(
  "/rekon",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getRekon,
);
router.post(
  "/rekon",
  verifyToken,
  checkPermission(menuId, "insert"),
  ctrl.saveRekon,
);

module.exports = router;
