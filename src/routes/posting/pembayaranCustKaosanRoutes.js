const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/posting/pembayaranCustKaosanController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 52;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.get(
  "/detail",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getBrowseDetail,
);
router.delete(
  "/:nomor",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteData,
);

module.exports = router;
