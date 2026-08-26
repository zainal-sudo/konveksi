const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/tools/masterUserFormController");
const {
  verifyToken,
  checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 1;

router.get(
  "/cabang",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getCabangList,
);
router.get(
  "/menus",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getAllMenus,
);
router.get(
  "/detail/:kode",
  verifyToken,
  checkPermission(menuId, "view"),
  ctrl.getDetail,
);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.save);

module.exports = router;
