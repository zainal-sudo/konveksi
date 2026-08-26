const db = require("../../config/database");

// ── Generate kode dari inisial nama, contoh: "Toko Sinar Jaya" -> TSJ ──
// Kalau inisial itu sudah dipakai, baru ditambah angka di belakang: TSJ2, TSJ3, dst.
const generateKodeFromNama = async (nama) => {
  let initials = nama
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);

  if (!initials) initials = "CUS";

  // Coba pakai inisial polos dulu (tanpa angka)
  const [[exists]] = await db.query(
    `SELECT cus_kode FROM tcustomer WHERE cus_kode = ?`,
    [initials]
  );
  if (!exists) return initials;

  // Sudah dipakai -> cari angka berikutnya yang belum kepakai
  const [rows] = await db.query(
    `SELECT cus_kode FROM tcustomer WHERE cus_kode LIKE ?`,
    [`${initials}%`]
  );
  const usedNumbers = new Set();
  for (const r of rows) {
    const suffix = r.cus_kode.slice(initials.length);
    const n = parseInt(suffix, 10);
    if (!isNaN(n) && String(n) === suffix) usedNumbers.add(n);
  }

  let next = 2;
  while (usedNumbers.has(next)) next++;

  return `${initials}${next}`;
};

const getAll = async () => {
  const [rows] = await db.query(
    `SELECT 
      cus_kode AS kode, cus_nama AS nama, cus_alamat AS alamat, cus_kota AS kota, 
      cus_telp AS telp, cus_CP AS cp, cus_piutang AS piutang 
     FROM tcustomer ORDER BY cus_kode`
  );
  return rows;
};

const getById = async (kode) => {
  const [[row]] = await db.query(
    `SELECT 
      cus_kode AS kode, cus_nama AS nama, cus_alamat AS alamat, cus_kota AS kota, 
      cus_fax AS fax, cus_telp AS telp, cus_CP AS cp, cus_top AS top, 
      cus_email AS email
     FROM tcustomer WHERE cus_kode = ?`,
    [kode]
  );
  if (!row) throw new Error("Customer tidak ditemukan.");
  return row;
};

const saveData = async (payload, username) => {
  const { 
    isEdit, kode, nama, alamat, kota, fax, telp, cp, top, email 
  } = payload;

  const now = new Date();
  let kodeCustomer = kode ? kode.trim() : "";

  if (isEdit) {
    await db.query(
      `UPDATE tcustomer SET 
        cus_nama = ?, cus_alamat = ?, cus_kota = ?, cus_fax = ?, cus_telp = ?, 
        cus_CP = ?, cus_top = ?, cus_email = ?, date_modified = ?, user_modified = ?
       WHERE cus_kode = ?`,
      [
        nama, alamat || "", kota || "", fax || "", telp || "", 
        cp || "", top || 0, email || "", now, username, kodeCustomer
      ]
    );
  } else {
    if (!kodeCustomer) {
      // ── Kosong → generate otomatis dari inisial nama ──
      kodeCustomer = await generateKodeFromNama(nama);
    } else {
      // ── Diisi manual → pastikan belum dipakai customer lain ──
      const [[exists]] = await db.query(
        `SELECT cus_kode FROM tcustomer WHERE cus_kode = ?`,
        [kodeCustomer]
      );
      if (exists) {
        throw new Error(`Kode customer "${kodeCustomer}" sudah digunakan.`);
      }
    }

    await db.query(
      `INSERT INTO tcustomer 
        (cus_kode, cus_nama, cus_alamat, cus_kota, cus_fax, cus_telp, cus_CP, cus_piutang, cus_top, 
         date_create, user_create, cus_email) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        kodeCustomer, nama, alamat || "", kota || "", fax || "", telp || "", cp || "", 
        top || 0, now, username, email || ""
      ]
    );
  }
  return { kode: kodeCustomer };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tcustomer WHERE cus_kode = ?`, [kode]);
};

module.exports = { getAll, getById, saveData, deleteData };