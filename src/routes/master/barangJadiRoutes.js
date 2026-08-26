const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/barangJadiController");

router.get("/templates/list", ctrl.getTemplateList); // harus di atas /:kode
router.get("/", ctrl.getAll);
router.get("/:kode", ctrl.getById);
router.get("/:kode/komposisi", ctrl.getKomposisi);
router.post("/save", ctrl.saveData);
router.delete("/:kode", ctrl.deleteData);

module.exports = router;