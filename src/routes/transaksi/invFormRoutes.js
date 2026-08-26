const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/invFormController");

const menuId = 12; // ⚠️ SAMAKAN dengan ID menu form Invoice

router.get("/bpb-options", ctrl.getBpbOptions);
router.get("/bpb-detail/:nomor", ctrl.getBpbDetail);
router.get("/form/:nomor", ctrl.getDetailForm);
router.post("/save", ctrl.saveData);

module.exports = router;

// Di app.js / index.js kamu, daftarkan seperti:
// app.use("/api/transaksi/invoice", require("./routes/transaksi/invRoutes"));
// app.use("/api/transaksi/invoice/form", require("./routes/transaksi/invFormRoutes"));