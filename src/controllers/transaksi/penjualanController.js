const db = require("../../config/database");
const { getBrowseDetail } = require("./poController");

// ==========================================
// 1. GENERATE NOMOR NOTA OTOMATIS (SO_NOMOR)
// ==========================================
// Menerima parameter connection (koneksi aktif) dan userKasirId secara eksplisit
const queryGenerateNotaSO = async (connection, userKasirId, tanggalInput) => {
  const dateObj = tanggalInput ? new Date(tanggalInput) : new Date();
  
  const year = dateObj.getFullYear(); // 2026
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0"); 
  const day = dateObj.getDate().toString().padStart(2, "0"); 
 
  // Pastikan aman jika userKasirId kosong/null
  const idKasir = userKasirId || 0;

  // Prefix dinamis: SAL-[user_id][YYYY][mm][dd]
  const prefix = `SAL-${idKasir}${year}${month}${day}`; 

  // Menggunakan connection transaksi dan substring dinamis sesuai panjang prefix
  const [[runNumber]] = await connection.query(
    `SELECT MAX(SUBSTRING(so_nomor, ${prefix.length + 1}, 3)) AS last_num 
     FROM tso_hdr 
     WHERE so_nomor LIKE ?`,
    [`${prefix}%`]
  );

  // Counter 3 digit (001, 002, dst)
  const nextNum = (parseInt(runNumber.last_num || 0) + 1).toString().padStart(3, "0");
  return `${prefix}${nextNum}`;
};

// ==========================================
// 2. HTTP HANDLER (CONTROLLER)
// ==========================================

// GET /transaksi/penjualan -> Browse History Riwayat Kasir
const getAllHistory = async (req, res) => {
  try {
    // Ambil tanggal hari ini sebagai default jika parameter tidak dikirim
    const todayStr = new Date().toISOString().substring(0, 10);
    const startDate = req.query.startDate || todayStr;
    const endDate = req.query.endDate || todayStr;

    const [rows] = await db.query(
      `SELECT 
        so_nomor AS NOTA,
        DATE_FORMAT(so_tanggal, '%Y-%m-%d')  AS TANGGAL,
        so_amount AS TOTAL,
        so_bayar AS BAYAR,
        so_kembali AS KEMBALI,
        user_nama AS KASIR,
        so_cus_kode AS CUS_KODE,
        cus_nama AS CUSTOMER
       FROM tso_hdr 
       inner join tcustomer on cus_kode=so_cus_kode
       left join tuser on tuser.user_kode=tso_hdr.so_user_kasir
       WHERE DATE(so_tanggal) BETWEEN ? AND ?
       ORDER BY so_nomor DESC`,
       [startDate, endDate]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getDetailHistory = async (req, res) => {
  try {
    // 🔴 UBAH DI SINI: Samakan dengan yang di routes (:nomor)
    const { nomor } = req.params; 

    // Validasi menggunakan variabel nomor
    if (!nomor) {
      return res.status(400).json({ success: false, message: "Nomor nota wajib diisi." });
    }

    const [rows] = await db.query(
      `SELECT 
        d.sod_brg_kode AS brgKode,
        b.brg_nama AS brgNama,
        d.sod_brg_satuan AS brgSatuan,
        d.sod_qty AS qty,
        d.sod_harga AS harga,
        d.sod_discpr AS discPr,
        d.sod_discrp AS discRp,
        d.sod_nourut AS noUrut
        
       FROM tso_dtl d
       INNER JOIN tbarang b ON d.sod_brg_kode = b.brg_kode
       WHERE d.sod_so_nomor = ?
       ORDER BY d.sod_nourut ASC`,
      [nomor] // 🔴 Masukkan variabel nomor ke sini
    );

    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /transaksi/penjualan/init -> Mengambil No. Nota Otomatis Baru saat load awal
const getInitData = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const userKode = req.user ? req.user.kode : null;
    // Kasir diidentifikasi pakai user_kode (satu-satunya identifier di tuser,
    // tidak ada kolom user_id). Tidak perlu query tambahan ke DB.
    const userKasirId = userKode;

    const todayStr = new Date().toISOString().substring(0, 10);
    // Oper connection, userKasirId, dan tanggal ke generator
    const notaOtomatis = await queryGenerateNotaSO(connection, userKasirId, todayStr);
    
    res.json({ success: true, data: { notaOtomatis } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  } finally {
    connection.release();
  }
};

// POST /transaksi/penjualan/save -> Simpan Transaksi Kasir
const saveData = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { header, details } = req.body;
    
    const userKode = req.user ? req.user.kode : null;
    // Kasir diidentifikasi pakai user_kode (satu-satunya identifier di tuser,
    // tidak ada kolom user_id). Tidak perlu query tambahan ke DB.
    const userKasirId = userKode;

    // Ambil nomor nota otomatis baru (Kirim connection, userKasirId, dan tanggal asli transaksi)
    const notaFinal = await queryGenerateNotaSO(connection, userKasirId, header.tanggal);

    // INSERT HEADER 
    await connection.query(
      `INSERT INTO tso_hdr 
        (so_nomor, so_tanggal, so_cus_kode, so_amount, so_ongkir, so_bayar, so_voucher, so_no_voucher, so_card, so_no_card, so_bank_card, so_piutang, so_kembali, so_user_kasir) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notaFinal,
        header.tanggal,
        header.cusKode,
        header.amount,
        header.ongkir || 0,
        header.bayar || 0,       
        header.voucher || 0,
        header.noVoucher || "",
        header.card || 0,
        header.noCard || "",
        header.bankCard || "",
        header.piutang || 0,
        header.kembali || 0,
        userKasirId             
      ]
    );

    // INSERT DETAILS
    let noUrut = 1;
    for (const item of details) {

      const [barangRows] = await connection.query(
        `SELECT brg_hrgbeli, brg_ktg_kode FROM tbarang WHERE brg_kode = ?`,
        [item.brgKode]
      );
    
      // Default nilai jika data barang ternyata tidak ditemukan di master database
      let avgCost = 0;
      let ktgKode = "";
    
      if (barangRows && barangRows.length > 0) {
        // Sesuaikan nama kolom database tbarang Anda (misal: brg_avgcost atau avgcost)
        avgCost = Number(barangRows[0].brg_hrgbeli || 0);
        ktgKode = barangRows[0].brg_ktg_kode || "";
      }

      await connection.query(
        `INSERT INTO tso_dtl 
          (sod_so_nomor, sod_brg_kode, sod_brg_satuan, sod_qty, sod_discpr, sod_harga, sod_nourut, sod_discrp, sod_qtykasir, sod_hargakasir, sod_tipeharga,sod_brg_avgcost,sod_ktg_kode) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?)`,
        [
          notaFinal,
          item.brgKode,
          item.brgSatuan || "PCS",
          item.qty,
          item.discPr || 0,
          item.harga,
          noUrut++,
          item.discRp || 0,
          item.qty,
          item.hargaKasir,
          item.tipeHarga || 1,
          avgCost,
          ktgKode
        ]
      );

      // Potong Stok
      await connection.query(
        `UPDATE tbarang SET brg_stok = brg_stok - ? WHERE brg_kode = ?`,
        [item.qty, item.brgKode]
      );
    }

    await connection.commit();
    return res.status(200).json({ success: true, message: "Transaksi Berhasil", data: { nota: notaFinal } });

  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};
const getCustomer = async (req, res) => {
  try {
    const search = req.query.search || "";
    
    // Cari berdasarkan kode atau nama customer
    const [rows] = await db.query(
      `SELECT Cus_kode AS kode, Cus_nama AS nama 
       FROM tcustomer 
       WHERE Cus_kode LIKE ? OR Cus_nama LIKE ? 
       LIMIT 50`,
      [`%${search}%`, `%${search}%`]
    );
    
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ==========================================
// 3. FITUR PENDING TRANSAKSI
// ==========================================

// A. Simpan Keranjang ke Tabel Pending (POST)
const savePending = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { header, details } = req.body;

    const userKode = req.user ? req.user.kode : null;
    // Kasir diidentifikasi pakai user_kode (satu-satunya identifier di tuser,
    // tidak ada kolom user_id). Tidak perlu query tambahan ke DB.
    const userKasirId = userKode;

    // Generate Nomor Pending Unik, contoh: PND-11202607060001
    const dateObj = new Date();
    const prefix = `PND-${userKasirId || 0}${dateObj.getFullYear()}${(dateObj.getMonth() + 1).toString().padStart(2, "0")}${dateObj.getDate().toString().padStart(2, "0")}`;
    
    const [[runNumber]] = await connection.query(
      `SELECT MAX(SUBSTRING(pen_nomor, ${prefix.length + 1}, 4)) AS last_num FROM tpending_hdr WHERE pen_nomor LIKE ?`,
      [`${prefix}%`]
    );
    const nextNum = (parseInt(runNumber.last_num || 0) + 1).toString().padStart(4, "0");
    const noPending = `${prefix}${nextNum}`;

    // Insert Header Pending
    await connection.query(
      `INSERT INTO tpending_hdr (pen_nomor, pen_tanggal, pen_cus_kode, pen_amount, pen_user_kasir) VALUES (?, ?, ?, ?, ?)`,
      [noPending, header.tanggal, header.cusKode, header.amount, userKasirId]
    );

    // Insert Detail Pending
    let noUrut = 1;
    for (const item of details) {
      await connection.query(
        `INSERT INTO tpending_dtl (ped_pen_nomor, ped_brg_kode, ped_brg_satuan, ped_qty, ped_harga, ped_nourut, ped_hargakasir, ped_tipeharga,ped_discRp) VALUES (?, ?, ?, ?, ?, ?, ?, ? ,?)`,
        [noPending, item.brgKode, item.brgSatuan || "PCS", item.qty, item.harga, noUrut++, item.hargaKasir, item.tipeHarga || 1, item.discRp]
      );
    }

    await connection.commit();
    res.json({ success: true, message: "Transaksi Berhasil Ditunda (Pending)", data: { noPending } });
  } catch (e) {
    await connection.rollback();
    res.status(500).json({ success: false, message: e.message });
  } finally {
    connection.release();
  }
};

// B. Ambil Daftar Nota yang Sedang Dipending (GET)
const getPendingList = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        h.pen_nomor AS NO_PENDING, 
        h.pen_tanggal AS TANGGAL, 
        h.pen_amount AS TOTAL, 
        c.Cus_nama AS CUSTOMER,
        h.pen_cus_kode AS CUS_KODE
       FROM tpending_hdr h
       LEFT JOIN tcustomer c ON h.pen_cus_kode = c.Cus_kode
       ORDER BY h.pen_tanggal DESC`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// C. Ambil Detail Barang yang Dipending & Langsung Hapus dari Antrean (POST)
const takePending = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { noPending } = req.body;

    // 1. Ambil data header & detail barang yang dihold
    const [[header]] = await connection.query(`SELECT * FROM tpending_hdr WHERE pen_nomor = ?`, [noPending]);
    if (!header) {
      throw new Error("Nota pending tidak ditemukan.");
    }

    const [details] = await connection.query(
      `SELECT 
        d.ped_brg_kode AS brgKode, 
        b.brg_nama AS barangNama, 
        d.ped_brg_satuan AS brgSatuan, 
        d.ped_qty AS qty, 
        d.ped_harga AS harga, 
        d.ped_hargakasir AS hargaKasir, 
        d.ped_discRp AS discRp,
        d.ped_tipeharga AS tipeHarga ,
        (d.ped_qty * (d.ped_harga-d.ped_discRp)) AS subtotal
       FROM tpending_dtl d
       JOIN tbarang b ON d.ped_brg_kode = b.brg_kode
       WHERE d.ped_pen_nomor = ?`, 
      [noPending]
    );

    // 2. Hapus dari tabel pending agar tidak bisa ditarik 2 kali (sesuai logika UfrmKasir.pas)
    await connection.query(`DELETE FROM tpending_dtl WHERE ped_pen_nomor = ?`, [noPending]);
    await connection.query(`DELETE FROM tpending_hdr WHERE pen_nomor = ?`, [noPending]);

    await connection.commit();
    res.json({ success: true, data: { header, details } });
  } catch (e) {
    await connection.rollback();
    res.status(500).json({ success: false, message: e.message });
  } finally {
    connection.release();
  }
};
module.exports = {
  getAllHistory,
  getInitData,
  saveData,
  getCustomer,
  savePending,
  getPendingList,
  takePending,getDetailHistory
};