const mysql = require("mysql2/promise");
require("dotenv").config();

// Koneksi kedua: database MINIMARKET (host 143.198.220.117)
// dipakai modul Pembayaran Customer (data transaksi toko lama/duplikasi).
const poolMinimarket = mysql.createPool({
  host: process.env.MM_DB_HOST || "143.198.220.117",
  port: process.env.MM_DB_PORT || 3306,
  user: process.env.MM_DB_USER || "root",
  password: process.env.MM_DB_PASSWORD || "Zainal_12345",
  database: process.env.MM_DB_NAME || "minimarket",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

module.exports = poolMinimarket;
