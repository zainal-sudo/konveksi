const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/tools/masterUserController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 33;;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getBrowse);
router.delete(
  "/:kode",
  verifyToken,
  checkPermission(menuId, "delete"),
  ctrl.deleteUser,
);

module.exports = router;
