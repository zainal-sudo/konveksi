const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(
    `SELECT 
      Sup_kode AS kode, Sup_nama AS nama, Sup_alamat AS alamat, Sup_kota AS kota,
      Sup_fax AS fax, Sup_telp AS telp, Sup_CP AS cp, Sup_hutang AS hutang, Sup_top AS top,
      sup_bank AS bank, sup_rekening AS rekening, sup_atasnama AS atasNama, sup_cabang AS cabang,
      sup_email AS email
     FROM tsupplier ORDER BY Sup_kode`,
  );
  return rows;
};

const getById = async (kode) => {
  const [[row]] = await db.query(
    `SELECT 
      Sup_kode AS kode, Sup_nama AS nama, Sup_alamat AS alamat, Sup_kota AS kota,
      Sup_fax AS fax, Sup_telp AS telp, Sup_CP AS cp, Sup_hutang AS hutang, Sup_top AS top,
      sup_bank AS bank, sup_rekening AS rekening, sup_atasnama AS atasNama, sup_cabang AS cabang,
      sup_email AS email
     FROM tsupplier WHERE Sup_kode = ?`,
    [kode],
  );
  if (!row) throw new Error("Supplier tidak ditemukan.");
  return row;
};

const saveData = async (payload, username) => {
  const { 
    isEdit, kode, nama, alamat, kota, fax, telp, cp, top, 
    bank, rekening, atasNama, cabang, email 
  } = payload;

  const now = new Date();
  let kodeSupplier = kode; // Tampung kode awal

  if (isEdit) {
    await db.query(
      `UPDATE tsupplier SET 
        Sup_nama = ?, Sup_alamat = ?, Sup_kota = ?, Sup_fax = ?, Sup_telp = ?, 
        Sup_CP = ?, Sup_top = ?, sup_bank = ?, sup_rekening = ?, sup_atasnama = ?, 
        sup_cabang = ?, sup_email = ?, date_modified = ?, user_modified = ?
       WHERE Sup_kode = ?`,
      [
        nama, alamat || "", kota || "", fax || "", telp || "", 
        cp || "", top || 0, bank || "", rekening || "", atasNama || "", 
        cabang || "", email || "", now, username, kodeSupplier
      ],
    );
  } else {
    // 💡 JIKA KODE KOSONG ATAU UNTUK AMANNYA KITA GENERATE OTOMATIS
    if (!kodeSupplier || kodeSupplier.trim() === "") {
      // Ambil kode terbesar yang nilainya angka (menggunakan CAST agar urutan string tetap benar secara numerik)
      const [[maxRow]] = await db.query(
        `SELECT Sup_kode FROM tsupplier 
         WHERE Sup_kode REGEXP '^[0-9]+$' 
         ORDER BY CAST(Sup_kode AS UNSIGNED) DESC LIMIT 1`
      );

      let nextNumber = 1;
      if (maxRow && maxRow.Sup_kode) {
        nextNumber = parseInt(maxRow.Sup_kode, 10) + 1;
      }

      // Format menjadi 6 digit dengan padding nol di depan (e.g., 000048)
      kodeSupplier = String(nextNumber).padStart(6, '0');
    } else {
      // Jika user menginputkan kode manual, pastikan kodenya belum ada di database
      const [[cek]] = await db.query(
        `SELECT COUNT(*) AS c FROM tsupplier WHERE Sup_kode = ?`,
        [kodeSupplier],
      );
      if (cek.c > 0) throw new Error(`Kode Supplier "${kodeSupplier}" sudah ada.`);
    }

    // Jalankan INSERT menggunakan kodeSupplier yang sudah fix
    await db.query(
      `INSERT INTO tsupplier 
        (Sup_kode, Sup_nama, Sup_alamat, Sup_kota, Sup_fax, Sup_telp, Sup_CP, Sup_hutang, Sup_top, 
         sup_bank, sup_rekening, sup_atasnama, sup_cabang, date_create, user_create, sup_email) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kodeSupplier, nama, alamat || "", kota || "", fax || "", telp || "", cp || "", 
        top || 0, bank || "", rekening || "", atasNama || "", cabang || "", now, username, email || ""
      ],
    );
  }
  return { kode: kodeSupplier };
};

const deleteData = async (kode) => {
  // Anda bisa menambahkan validasi cek foreign key di sini jika nanti sudah ada tabel transaksi pembelian
  await db.query(`DELETE FROM tsupplier WHERE Sup_kode = ?`, [kode]);
};

module.exports = { getAll, getById, saveData, deleteData };