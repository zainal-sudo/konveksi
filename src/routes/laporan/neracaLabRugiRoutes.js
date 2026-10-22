const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/laporan/neracaLabaRugiController");
const { verifyToken } = require("../../middleware/authMiddleware");

router.get("/neraca", verifyToken, ctrl.getNeraca);
router.get("/labarugi", verifyToken, ctrl.getLabaRugi);

module.exports = router;
