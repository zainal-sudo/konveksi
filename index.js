const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const systemCtrl = require("./controllers/systemController");

// ── Core Routes ──
const authRoutes = require("./routes/authRoutes");
const lookupRoutes = require("./routes/lookupRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const masterUserRoutes = require("./routes/tools/masterUserRoutes");
const masterUserFormRoutes = require("./routes/tools/masterUserFormRoutes");

// ── Master Routes ──
const supplierRoutes = require("./routes/master/supplierRoutes");
const kategoriRoutes = require("./routes/master/kategoriRoutes");
const barangRoutes = require("./routes/master/barangRoutes");
const customerRoutes = require("./routes/master/customerRoutes");
const gudangRoutes = require("./routes/master/gudangRoutes");
const kelompokRoutes = require("./routes/master/kelompokRoutes");
const rekeningRoutes = require("./routes/master/rekeningRoutes");
const jenisBarangRoutes = require("./routes/master/jenisBarangRoutes");
const prosesRoutes = require("./routes/master/prosesRoutes");
const cabangRoutes = require("./routes/master/cabangRoutes");

// ── Transaksi Routes ──
const poRoutes = require("./routes/transaksi/poRoutes");
const poFormRoutes = require("./routes/transaksi/poFormRoutes");
const bpbRoutes     = require("./routes/transaksi/bpbRoutes");
const bpbFormRoutes = require("./routes/transaksi/bpbFormRoutes");
const returRoutes     = require("./routes/transaksi/returRoutes");
const returFormRoutes = require("./routes/transaksi/returFormRoutes");
const bayarSupplierRoutes = require("./routes/transaksi/bayarSupplierRoutes");
const penjualanRoutes = require("./routes/transaksi/penjualanRoutes");
const penjualanFormRoutes = require("./routes/transaksi/penjualanFormRoutes");

const stbjRoutes = require("./routes/transaksi/stbjRoutes");
const stbjFormRoutes = require("./routes/transaksi/stbjFormRoutes");
const mutasiRoutes = require("./routes/transaksi/mutasiRoutes");
const mutasiFormRoutes = require("./routes/transaksi/mutasiFormRoutes");


const invRoutes = require("./routes/transaksi/invRoutes");
const invFormRoutes = require("./routes/transaksi/invFormRoutes");

const jurnalUmumRoutes = require("./routes/transaksi/jurnalUmumRoutes");
const jurnalUmumFormRoutes = require("./routes/transaksi/jurnalUmumFormRoutes");
const penyesuaianStokRoutes = require("./routes/transaksi/penyesuaianStokRoutes");
const penyesuaianStokFormRoutes = require("./routes/transaksi/penyesuaianStokFormRoutes");

// ── Posting Routes ──
const pembayaranCustomerRoutes = require("./routes/posting/pembayaranCustomerRoutes");
const pembayaranCustomerFormRoutes = require("./routes/posting/pembayaranCustomerFormRoutes");

// ── Accounting Routes ──
const accountingJurnalUmumRoutes = require("./routes/accounting/jurnalUmumRoutes");
const accountingJurnalUmumFormRoutes = require("./routes/accounting/jurnalUmumFormRoutes");
const accountingPembayaranLainRoutes = require("./routes/accounting/pembayaranLainRoutes");
const accountingPembayaranLainFormRoutes = require("./routes/accounting/pembayaranLainFormRoutes");
const accountingPenerimaanLainRoutes = require("./routes/accounting/penerimaanLainRoutes");
const accountingPenerimaanLainFormRoutes = require("./routes/accounting/penerimaanLainFormRoutes");

// ── Laporan Routes ──
const listJurnalRoutes = require("./routes/laporan/listJurnalRoutes");
const persediaanRoutes = require("./routes/laporan/persediaanRoutes");
const penjualanItemRoutes = require("./routes/laporan/penjualanItemRoutes");


const app = express();

// ── CORS ──
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, origin); // echo back origin agar credentials bisa jalan
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use("/images", express.static(path.join(process.cwd(), "public/images")));

// Endpoint untuk cek versi backend
app.get("/api/system/info", systemCtrl.getSystemInfo);

// ── Core Routes ──
app.use("/api/auth", authRoutes);
app.use("/api/lookups", lookupRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/tools/master-user", masterUserRoutes);
app.use("/api/tools/master-user/form", masterUserFormRoutes);


app.use("/api/master/supplier", supplierRoutes);
app.use("/api/master/kategori", kategoriRoutes);
app.use("/api/master/barang", barangRoutes);
app.use("/api/master/customer", customerRoutes);
app.use("/api/master/gudang", gudangRoutes);
app.use("/api/master/kelompok", kelompokRoutes);
app.use("/api/master/rekening", rekeningRoutes);
app.use("/api/master/jenis-barang", jenisBarangRoutes);
app.use("/api/master/proses", prosesRoutes);
app.use("/api/master/cabang", cabangRoutes);
// ── Tambahan ──
app.use("/api/master/barang-jadi", require("./routes/master/barangJadiRoutes"));

// ── Transaksi Routes ──
app.use("/api/transaksi/po", poRoutes);
app.use("/api/transaksi/po/form", poFormRoutes);
app.use("/api/transaksi/bpb",       bpbRoutes);
app.use("/api/transaksi/bpb/form",  bpbFormRoutes);
app.use("/api/transaksi/retur",       returRoutes);
app.use("/api/transaksi/retur/form",  returFormRoutes);
app.use("/api/transaksi/bayarSupplier", bayarSupplierRoutes);
app.use("/api/transaksi/penjualan", penjualanRoutes);
app.use("/api/transaksi/penjualan/form", penjualanFormRoutes);

app.use("/api/transaksi/invoice", invRoutes);
app.use("/api/transaksi/invoice/form", invFormRoutes);

// Tambahkan di bagian app.use(...), persis di bawah baris po:
app.use("/api/transaksi/stbj", stbjRoutes);
app.use("/api/transaksi/stbj/form", stbjFormRoutes);

app.use("/api/transaksi/mutasi", mutasiRoutes);
app.use("/api/transaksi/mutasi/form", mutasiFormRoutes);

app.use("/api/transaksi/jurnal-umum", jurnalUmumRoutes);
app.use("/api/transaksi/jurnal-umum/form", jurnalUmumFormRoutes);
app.use("/api/transaksi/penyesuaian-stok", penyesuaianStokRoutes);
app.use("/api/transaksi/penyesuaian-stok/form", penyesuaianStokFormRoutes);

// ── Posting Routes ──
app.use("/api/posting/pembayaran-customer", pembayaranCustomerRoutes);
app.use("/api/posting/pembayaran-customer/form", pembayaranCustomerFormRoutes);

// ── Accounting Routes ──
app.use("/api/accounting/jurnal-umum", accountingJurnalUmumRoutes);
app.use("/api/accounting/jurnal-umum/form", accountingJurnalUmumFormRoutes);
app.use("/api/accounting/pembayaran-lain", accountingPembayaranLainRoutes);
app.use("/api/accounting/pembayaran-lain/form", accountingPembayaranLainFormRoutes);
app.use("/api/accounting/penerimaan-lain", accountingPenerimaanLainRoutes);
app.use("/api/accounting/penerimaan-lain/form", accountingPenerimaanLainFormRoutes);

// ── Laporan Routes ──
app.use("/api/laporan/list-jurnal", listJurnalRoutes);
app.use("/api/laporan/persediaan", persediaanRoutes);
app.use("/api/laporan/penjualanitem", penjualanItemRoutes);
app.use("/api/laporan/akunting", require("./routes/laporan/neracaLabRugiRoutes"));

// ── Health check ──
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Finance Backend is running",
    timestamp: new Date(),
  });
});

const PORT = process.env.PORT || 3089;
app.listen(PORT, () => {
  console.log(`🚀 Server Finance running on port ${PORT}`);
});
