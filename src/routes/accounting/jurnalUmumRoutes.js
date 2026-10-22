const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/accounting/jurnalUmumController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 41;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get(
  "/detail",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getBrowseDetail,
);
router.get(
  "/print/:nomor",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getPrintData,
);
router.delete(
  "/:nomor",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteData,
);

module.exports = router;
