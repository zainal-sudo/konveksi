const db = require("../../config/database");

/**
 * Service Master Barang — mapping ke seluruh kolom tabel `tbarang`.
 *
 * PENTING (perbaikan 13/8):
 *  - brg_sup_kode disamakan dgn TRIM() di kedua sisi supaya pemasok utama
 *    selalu ke-load balik saat form dibuka utk edit.
 *  - Rekening TIDAK disimpan di tbarang (kolom brg_rek_kode TIDAK ADA di
 *    tabel). Rekening murni dibaca via JOIN tgroup -> trekening di
 *    SELECT_BASE (rekKode/rekNama itu read-only, hanya utk ditampilkan).
 *  - Komposisi (tbarangkomposisi) bk_bhn_kode mengacu ke tbarang.brg_kode.
 *  - Biaya Non Bahan Baku pakai tabel `tbarang_nbb`
 *    (PK gabungan nbb_brg_kode + nbb_keterangan, TIDAK ADA kode auto
 *    increment). Kolom: nbb_brg_kode, nbb_keterangan, nbb_qty,
 *    nbb_satuan, nbb_nourut, nbb_jumlah.
 *  - INSERT/UPDATE ke tbarang dibangun dinamis dari object `columnMap`
 *    (lihat di dalam saveData) supaya jumlah kolom & placeholder "?"
 *    selalu otomatis sinkron — hindari salah hitung ? secara manual.
 */

const SELECT_BASE = `
  SELECT
    b.brg_kode           AS kode,
    b.brg_nama            AS nama,
    b.brg_satuan          AS satuan,
    b.brg_ktg_kode        AS ktgKode,
    k.ktg_nama            AS ktgNama,
    b.brg_gr_kode         AS jenisKode,
    g.gr_nama             AS jenisNama,
    g.gr_rek_kode         AS rekKode,
    rek.REK_NAMA          AS rekNama,
    b.brg_gdg_default     AS gdgDefault,
    gd.gdg_nama           AS gdgNama,
    b.brg_isstok          AS isStok,
    b.brg_isexpired       AS isExpired,
    b.brg_stok            AS stok,
    b.brg_hrgbeli         AS hrgBeli,
    b.brg_hrgjual         AS hrgJual,
    b.brg_MIN_STOK        AS minStok,
    b.brg_MAX_STOK        AS maxStok,
    b.date_create         AS dateCreate,
    b.date_modified       AS dateModified,
    b.user_create         AS userCreate,
    b.user_modified       AS userModified,
    b.brg_sup_kode        AS supKode,
    s.Sup_nama             AS supNama,
    b.brg_isaktif         AS isAktif,
    b.brg_disc_sales      AS discSales,
    b.brg_merk            AS merk,
    b.brg_isproductfocus  AS isProductFocus,
    b.brg_lastcost        AS lastCost,
    b.brg_divisi          AS divisi,
    b.brg_isboom          AS isBoom,
    b.brg_insentif        AS insentif,
    b.brg_harga_min       AS hargaMin,
    b.brg_kodelama        AS kodeLama,
    b.brg_spesifikasi     AS spesifikasi,
    (SELECT COUNT(*) FROM tbarangkomposisi bk WHERE bk.bk_brg_kode = b.brg_kode) AS jmlKomposisi
  FROM tbarang b
  LEFT JOIN tkategori k  ON k.ktg_kode = b.brg_ktg_kode
  LEFT JOIN tgroup g     ON g.gr_kode  = b.brg_gr_kode
  LEFT JOIN trekening rek ON rek.REK_KODE = g.gr_rek_kode
  LEFT JOIN tgudang gd   ON gd.gdg_kode = b.brg_gdg_default
  LEFT JOIN tsupplier s  ON TRIM(s.Sup_kode) = TRIM(b.brg_sup_kode)
`;

const getAll = async (filter = {}) => {
  const where = [];
  const params = [];

  if (filter.search) {
    where.push(`(b.brg_nama LIKE ? OR b.brg_kode = ? OR b.brg_kodelama LIKE ?)`);
    params.push(`%${filter.search}%`, filter.search, `%${filter.search}%`);
  }
  if (filter.ktgKode) {
    where.push(`b.brg_ktg_kode = ?`);
    params.push(filter.ktgKode);
  }
  if (filter.jenisKode) {
    where.push(`b.brg_gr_kode = ?`);
    params.push(filter.jenisKode);
  }
  if (filter.isAktif !== undefined && filter.isAktif !== "") {
    where.push(`b.brg_isaktif = ?`);
    params.push(Number(filter.isAktif));
  }

  const sql = `
    ${SELECT_BASE}
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY b.brg_kode DESC
  `;
  const [rows] = await db.query(sql, params);
  return rows;
};

const getById = async (kode) => {
  const [[row]] = await db.query(`${SELECT_BASE} WHERE b.brg_kode = ?`, [kode]);
  if (!row) throw new Error("Barang tidak ditemukan.");
  return row;
};

// ── Komposisi (Resep) — bk_bhn_kode mengacu ke tbarang.brg_kode ───────
const getKomposisi = async (kodeBarang) => {
  const [rows] = await db.query(
    `SELECT
       bk.bk_brg_kode    AS brgKode,
       bk.bk_bhn_kode    AS bahanKode,
       bh.brg_nama       AS bahanNama,
       bh.brg_satuan     AS bahanSatuanAsli,
       bh.brg_hrgbeli    AS bahanHrgBeli,
       bk.bk_qty         AS qty,
       bk.bk_satuan      AS satuan,
       bk.bk_nourut      AS noUrut,
       bk.bk_spesifikasi AS spesifikasi
     FROM tbarangkomposisi bk
     JOIN tbarang bh ON bh.brg_kode = bk.bk_bhn_kode
     WHERE bk.bk_brg_kode = ?
     ORDER BY bk.bk_nourut ASC`,
    [kodeBarang]
  );
  return rows;
};

// ── Biaya Non Bahan Baku (tab ke-3) — tabel: tbarang_nbb ───────────────
const getBiayaLain = async (kodeBarang) => {
  const [rows] = await db.query(
    `SELECT nbb_brg_kode   AS brgKode,
            nbb_keterangan AS nama,
            nbb_qty        AS qty,
            nbb_satuan     AS satuan,
            nbb_nourut     AS noUrut,
            nbb_jumlah     AS biaya
     FROM tbarang_nbb
     WHERE nbb_brg_kode = ?
     ORDER BY nbb_nourut ASC`,
    [kodeBarang]
  );
  return rows;
};

const numOrNull = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
const flag = (v, def = 0) => (v === undefined || v === null || v === "" ? def : Number(v) ? 1 : 0);

const validate = (payload) => {
  const { nama, satuan } = payload;
  if (!nama || !nama.trim()) throw new Error("Nama barang wajib diisi.");
  if (!satuan || !satuan.trim()) throw new Error("Satuan wajib diisi.");
};

const validateKomposisiItems = (items) => {
  if (!Array.isArray(items)) throw new Error("Data komposisi tidak valid.");
  for (const i of items) {
    if (!i.bahanKode) throw new Error("Ada baris komposisi tanpa barang/bahan yang dipilih.");
    if (!(Number(i.qty) > 0)) throw new Error("Qty komposisi harus lebih besar dari 0.");
    if (!i.satuan || !String(i.satuan).trim()) throw new Error("Satuan komposisi wajib diisi.");
  }
  const kodes = items.map((i) => i.bahanKode);
  if (new Set(kodes).size !== kodes.length) {
    throw new Error("Ada barang yang dipilih lebih dari sekali dalam komposisi.");
  }
};

const validateBiayaItems = (items) => {
  if (!Array.isArray(items)) throw new Error("Data biaya non bahan baku tidak valid.");
  for (const i of items) {
    if (!i.nama || !String(i.nama).trim()) throw new Error("Ada baris biaya tanpa nama/keterangan.");
    if (numOrNull(i.biaya) === null || Number(i.biaya) < 0) throw new Error("Biaya tidak boleh minus.");
  }
  const keys = items.map((i) => String(i.nama).trim().toLowerCase());
  if (new Set(keys).size !== keys.length) {
    throw new Error("Ada Keterangan biaya yang sama dipakai lebih dari sekali.");
  }
};

const saveData = async (payload, username) => {
  validate(payload);

  const {
    isEdit, kode, nama, satuan,
    ktgKode, jenisKode, gdgDefault,
    isStok, isExpired,
    hrgBeli, hrgJual, minStok, maxStok,
    supKode, isAktif, discSales, merk,
    isProductFocus, lastCost, divisi, isBoom,
    insentif, hargaMin, kodeLama, spesifikasi,
    items, biayaLain,
  } = payload;

  if (items) validateKomposisiItems(items);
  if (biayaLain) validateBiayaItems(biayaLain);

  const now = new Date();

  // Map kolom DB -> nilai. Dipakai dinamis supaya jumlah kolom & "?"
  // selalu otomatis sama banyak, tidak perlu hitung manual lagi.
  const columnMap = {
    brg_nama: nama.trim(),
    brg_satuan: satuan.trim(),
    brg_ktg_kode: ktgKode || null,
    brg_gr_kode: jenisKode || null,
    brg_gdg_default: gdgDefault || null,
    brg_isstok: flag(isStok, 1),
    brg_isexpired: flag(isExpired, 0),
    brg_hrgbeli: numOrNull(hrgBeli) ?? 0,
    brg_hrgjual: numOrNull(hrgJual) ?? 0,
    brg_MIN_STOK: numOrNull(minStok) ?? 0,
    brg_MAX_STOK: numOrNull(maxStok) ?? 0,
    brg_sup_kode: supKode || null,
    brg_isaktif: flag(isAktif, 1),
    brg_disc_sales: numOrNull(discSales) ?? 0,
    brg_merk: merk || null,
    brg_isproductfocus: flag(isProductFocus, 0),
    brg_lastcost: numOrNull(lastCost) ?? 0,
    brg_divisi: divisi || null,
    brg_isboom: flag(isBoom, 0),
    brg_insentif: numOrNull(insentif) ?? 0,
    brg_harga_min: numOrNull(hargaMin) ?? 0,
    brg_kodelama: kodeLama || null,
    brg_spesifikasi: spesifikasi || null,
  };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let finalKode = kode;

    if (isEdit) {
      if (!kode) throw new Error("Kode barang tidak valid.");

      const setCols = { ...columnMap, date_modified: now, user_modified: username };
      const setClause = Object.keys(setCols).map((c) => `${c} = ?`).join(", ");
      const setValues = Object.values(setCols);

      await conn.query(
        `UPDATE tbarang SET ${setClause} WHERE brg_kode = ?`,
        [...setValues, kode]
      );
    } else {
      const insertCols = { ...columnMap, brg_stok: 0, date_create: now, user_create: username };
      const cols = Object.keys(insertCols);
      const placeholders = cols.map(() => "?").join(", ");
      const insertValues = Object.values(insertCols);

      const [result] = await conn.query(
        `INSERT INTO tbarang (${cols.join(", ")}) VALUES (${placeholders})`,
        insertValues
      );
      finalKode = result.insertId;
    }

    // ── Komposisi (kalau field items dikirim, replace semua baris) ────
    if (items !== undefined) {
      await conn.query(`DELETE FROM tbarangkomposisi WHERE bk_brg_kode = ?`, [finalKode]);
      if (items.length > 0) {
        const rows = items.map((it, idx) => [
          finalKode,
          it.bahanKode,
          Number(it.qty),
          it.satuan,
          idx + 1,
          it.spesifikasi || "",
        ]);
        await conn.query(
          `INSERT INTO tbarangkomposisi (bk_brg_kode, bk_bhn_kode, bk_qty, bk_satuan, bk_nourut, bk_spesifikasi)
           VALUES ?`,
          [rows]
        );
      }
    }

    // ── Biaya Non Bahan Baku (kalau field biayaLain dikirim, replace) ─
    // tabel tbarang_nbb, PK gabungan (nbb_brg_kode, nbb_keterangan)
    if (biayaLain !== undefined) {
      await conn.query(`DELETE FROM tbarang_nbb WHERE nbb_brg_kode = ?`, [finalKode]);
      if (biayaLain.length > 0) {
        const rows = biayaLain.map((it, idx) => [
          finalKode,
          String(it.nama).trim(),
          it.qty !== undefined && it.qty !== null && it.qty !== "" ? Number(it.qty) : null,
          it.satuan || null,
          idx + 1,
          Number(it.biaya) || 0,
        ]);
        await conn.query(
          `INSERT INTO tbarang_nbb (nbb_brg_kode, nbb_keterangan, nbb_qty, nbb_satuan, nbb_nourut, nbb_jumlah)
           VALUES ?`,
          [rows]
        );
      }
    }

    await conn.commit();
    return { kode: finalKode };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const deleteData = async (kode) => {
  // TODO: cek pemakaian di tabel transaksi (penjualan, pembelian, mutasi, dsb)
  // sebelum benar-benar menghapus, supaya histori transaksi tidak kehilangan referensi.
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM tbarangkomposisi WHERE bk_brg_kode = ?`, [kode]);
    await conn.query(`DELETE FROM tbarang_nbb WHERE nbb_brg_kode = ?`, [kode]);
    await conn.query(`DELETE FROM tbarang WHERE brg_kode = ?`, [kode]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { getAll, getById, getKomposisi, getBiayaLain, saveData, deleteData };