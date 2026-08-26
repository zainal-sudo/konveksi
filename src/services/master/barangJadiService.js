const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(`
    SELECT 
      b.*,
      g2.gr_nama AS ktg_nama,
      g.gdg_nama,
      s.Sup_nama AS sup_nama
    FROM tbarang b
    LEFT JOIN tgroup g2 
      ON g2.gr_kode = b.brg_gr_kode
    LEFT JOIN tgudang g 
      ON g.gdg_kode = b.brg_gdg_default
    LEFT JOIN tsupplier s 
      ON TRIM(s.Sup_kode) = TRIM(b.brg_sup_kode)
    WHERE b.brg_gr_kode = 1
    ORDER BY b.brg_kode DESC
  `);

  return rows;
};

const getById = async (kode) => {
  const [rows] = await db.query(`
    SELECT 
      b.*,
      g2.gr_nama AS ktg_nama,
      g.gdg_nama,
      s.Sup_nama AS sup_nama
    FROM tbarang b
    LEFT JOIN tgroup g2 
      ON g2.gr_kode = b.brg_gr_kode
    LEFT JOIN tgudang g 
      ON g.gdg_kode = b.brg_gdg_default
    LEFT JOIN tsupplier s 
      ON TRIM(s.Sup_kode) = TRIM(b.brg_sup_kode)
    WHERE b.brg_kode = ?
  `, [kode]);

  if (rows.length === 0) {
    throw new Error("Barang tidak ditemukan.");
  }

  return rows[0];
};

const getKomposisi = async (kodeBarang) => {
  const [rows] = await db.query(
    `SELECT bk.*, bh.bhn_nama, bh.brg_satuan AS bhn_satuan_asli
     FROM tbarangkomposisi bk
     JOIN tbahan bh ON bh.bhn_kode = bk.bk_bhn_kode
     WHERE bk.bk_brg_kode = ?
     ORDER BY bk.bk_nourut ASC`,
    [kodeBarang]
  );
  return rows;
};

// Daftar barang jadi yang SUDAH punya resep (untuk dipakai sebagai template
// pas user pilih "Pilih dari Komposisi yang Ada" di form Barang Jadi).
const getTemplateList = async () => {
  const [rows] = await db.query(`
    SELECT DISTINCT b.brg_kode, b.brg_nama, b.brg_satuan
    FROM tbarang b
    INNER JOIN tbarangkomposisi bk ON bk.bk_brg_kode = b.brg_kode
    WHERE b.brg_gr_kode = 1
    ORDER BY b.brg_nama ASC
  `);
  return rows;
};

const checkDuplicateName = async (conn, nama, excludeKode) => {
  const [rows] = await conn.query(
    `SELECT brg_kode FROM tbarang 
     WHERE LOWER(TRIM(brg_nama)) = LOWER(TRIM(?)) 
       AND brg_gr_kode = 1
       ${excludeKode ? "AND brg_kode != ?" : ""}`,
    excludeKode ? [nama, excludeKode] : [nama]
  );
  return rows.length > 0;
};

// Default tetap untuk Barang Jadi — gudang & rekening sudah pasti (fixed
// master), jadi langsung di-set di server kalau frontend tidak mengirim
// nilai (misal request lama / lewat Postman tanpa field ini).
const DEFAULT_GDG_KODE = "GJ-01";       // Gudang Produk Jadi
const DEFAULT_REK_KODE = "17.004";      // Persediaan Barang Jadi

// ── Validasi ─────────────────────────────────────────────────────────

const validateBarangInput = (data) => {
  if (!data.brg_nama || !String(data.brg_nama).trim()) {
    throw new Error("Nama barang wajib diisi.");
  }
  if (String(data.brg_nama).trim().length < 3) {
    throw new Error("Nama barang minimal 3 karakter.");
  }
  if (!data.brg_satuan || !String(data.brg_satuan).trim()) {
    throw new Error("Satuan wajib diisi.");
  }

  const hrgJual = Number(data.brg_hrgjual);
  if (!Number.isFinite(hrgJual) || hrgJual <= 0) {
    throw new Error("Harga jual wajib diisi dan tidak boleh 0 atau minus.");
  }

  const minStok = data.brg_MIN_STOK != null ? Number(data.brg_MIN_STOK) : 0;
  const maxStok = data.brg_MAX_STOK != null ? Number(data.brg_MAX_STOK) : 0;
  if (!Number.isFinite(minStok) || minStok < 0) {
    throw new Error("Min stok tidak boleh minus.");
  }
  if (!Number.isFinite(maxStok) || maxStok < 0) {
    throw new Error("Max stok tidak boleh minus.");
  }
  if (maxStok > 0 && maxStok < minStok) {
    throw new Error("Max stok tidak boleh lebih kecil dari min stok.");
  }
};

const validateKomposisiItems = (items) => {
  if (!Array.isArray(items)) {
    throw new Error("Data komposisi tidak valid.");
  }
  for (const i of items) {
    if (!i.bk_bhn_kode) {
      throw new Error("Ada baris komposisi tanpa bahan yang dipilih.");
    }
    if (!(Number(i.bk_qty) > 0)) {
      throw new Error("Qty komposisi harus lebih besar dari 0.");
    }
    if (!i.bk_satuan || !String(i.bk_satuan).trim()) {
      throw new Error("Satuan komposisi wajib diisi.");
    }
  }
  const bhnKodes = items.map((i) => i.bk_bhn_kode);
  if (new Set(bhnKodes).size !== bhnKodes.length) {
    throw new Error("Ada bahan yang dipilih lebih dari sekali dalam komposisi.");
  }
};

// Hitung ulang HPP dari harga bahan AKTUAL di database (tbahan.bhn_hrgbeli),
// bukan dari angka yang dikirim client. Ini mencegah manipulasi HPP lewat
// request langsung (Postman/devtools) yang melewati kalkulasi frontend.
// PENTING: komposisi bahan barang jadi berasal dari tabel tbahan (bhn_kode),
// BUKAN dari tbarang (brg_kode) — dua tabel yang terpisah.
const calcHppFromKomposisi = async (conn, items) => {
  if (!items || items.length === 0) return 0;

  const kodes = items.map((i) => i.bk_bhn_kode);
  const [bahanRows] = await conn.query(
    `SELECT bhn_kode, bhn_hrgbeli FROM tbahan WHERE bhn_kode IN (?)`,
    [kodes]
  );
  const hargaMap = new Map(bahanRows.map((b) => [b.bhn_kode, Number(b.bhn_hrgbeli) || 0]));

  let total = 0;
  for (const item of items) {
    if (!hargaMap.has(item.bk_bhn_kode)) {
      throw new Error(`Bahan dengan kode ${item.bk_bhn_kode} tidak ditemukan.`);
    }
    total += (Number(item.bk_qty) || 0) * hargaMap.get(item.bk_bhn_kode);
  }
  return Math.round(total);
};

// ── Save gabungan (barang + komposisi) dalam satu transaksi ──────────
const saveBarangJadiWithKomposisi = async (data, items, username) => {
  validateBarangInput(data);
  validateKomposisiItems(items || []);

  // Gudang & rekening: pakai nilai dari client kalau ada, kalau kosong
  // pakai default fixed (GJ-01 / 17.004) — jadi tetap ke-input otomatis
  // tanpa perlu user pilih apa-apa.
  const gdgKode = data.brg_gdg_default || DEFAULT_GDG_KODE;
  const rekKode = data.brg_rek_kode || DEFAULT_REK_KODE;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const isDuplicate = await checkDuplicateName(conn, data.brg_nama, data.brg_kode || null);
    if (isDuplicate) {
      throw new Error(`Nama barang "${data.brg_nama}" sudah dipakai oleh barang jadi lain. Gunakan nama yang berbeda.`);
    }
    const hpp = await calcHppFromKomposisi(conn, items || []);
    const hasKomposisi = items && items.length > 0 ? 1 : 0;
    let kode = data.brg_kode;

    if (kode) {
      const [existing] = await conn.query(
        `SELECT brg_kode FROM tbarang WHERE brg_kode = ? FOR UPDATE`,
        [kode]
      );
      if (existing.length === 0) {
        throw new Error("Barang tidak ditemukan.");
      }

      await conn.query(
        `UPDATE tbarang SET
          brg_nama=?, brg_satuan=?, brg_ktg_kode=?, brg_gdg_default=?,
          brg_merk=?, brg_isstok=?, brg_isaktif=?, brg_hrgbeli=?, brg_hrgjual=?,
          brg_MIN_STOK=?, brg_MAX_STOK=?, brg_sup_kode=?, brg_spesifikasi=?,
          brg_hpp_terakhir=?, brg_isboom=?, brg_rek_kode=?,
          date_modified=NOW(), user_modified=?
         WHERE brg_kode=?`,
        [
          String(data.brg_nama).trim(),
          data.brg_satuan,
          data.brg_ktg_kode || null,
          gdgKode,
          data.brg_merk || null,
          data.brg_isstok ?? 0,
          data.brg_isaktif ?? 1,
          hpp,
          Number(data.brg_hrgjual),
          Number(data.brg_MIN_STOK) || 0,
          Number(data.brg_MAX_STOK) || 0,
          data.brg_sup_kode || null,
          data.brg_spesifikasi || null,
          hpp,
          hasKomposisi,
          rekKode,
          username,
          kode,
        ]
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO tbarang
          (brg_nama, brg_satuan, brg_ktg_kode, brg_gr_kode, brg_gdg_default, brg_merk, brg_isstok, brg_isaktif,
           brg_hrgbeli, brg_hrgjual, brg_MIN_STOK, brg_MAX_STOK, brg_sup_kode, brg_spesifikasi,
           brg_hpp_terakhir, brg_isboom, brg_rek_kode,
           date_create, user_create)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW(), ?)`,
        [
          String(data.brg_nama).trim(),
          data.brg_satuan,
          data.brg_ktg_kode || null,
          1, // brg_gr_kode = 1 (Barang Jadi)
          gdgKode,
          data.brg_merk || null,
          data.brg_isstok ?? 0,
          data.brg_isaktif ?? 1,
          hpp,
          Number(data.brg_hrgjual),
          Number(data.brg_MIN_STOK) || 0,
          Number(data.brg_MAX_STOK) || 0,
          data.brg_sup_kode || null,
          data.brg_spesifikasi || null,
          hpp,
          hasKomposisi,
          rekKode,
          username,
        ]
      );
      kode = result.insertId;
    }

    await conn.query(`DELETE FROM tbarangkomposisi WHERE bk_brg_kode = ?`, [kode]);

    if (items && items.length > 0) {
      const values = items.map((item, idx) => [
        kode,
        item.bk_bhn_kode,
        Number(item.bk_qty),
        item.bk_satuan,
        idx + 1,
        item.bk_spesifikasi || "",
      ]);
      await conn.query(
        `INSERT INTO tbarangkomposisi (bk_brg_kode, bk_bhn_kode, bk_qty, bk_satuan, bk_nourut, bk_spesifikasi)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    return { brg_kode: kode, brg_hrgbeli: hpp, brg_hpp_terakhir: hpp };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const deleteData = async (kode) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM tbarangkomposisi WHERE bk_brg_kode = ?`, [kode]);
    const [result] = await conn.query(`DELETE FROM tbarang WHERE brg_kode = ?`, [kode]);
    if (result.affectedRows === 0) {
      throw new Error("Barang tidak ditemukan atau sudah terhapus.");
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = {
  getAll,
  getById,
  getKomposisi,
  getTemplateList,
  saveBarangJadiWithKomposisi,
  deleteData,
};