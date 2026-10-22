const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");
const { createAutoJurnalMutasiIn } = require("../../utils/jurnalMutasiCabang");

// ── Generate Nomor Otomatis ──────────────────────────────────────────
const getMaxNomor = async (tanggal, cabang) => {
  const d = new Date(tanggal);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${cabang}-MTCI.${yy}${mm}.`;

  const [[row]] = await db.query(
    `SELECT IFNULL(MAX(CAST(RIGHT(mutci_nomor, 4) AS UNSIGNED)), 0) AS max_val
      FROM tmutcabin_hdr
      WHERE mutci_nomor LIKE ?`,
    [`${prefix}%`]
  );
  const nextNum = 10000 + Number(row.max_val) + 1;
  return `${prefix}${String(nextNum).slice(-4)}`;
};

// ── Lookup Cabang ────────────────────────────────────────────────────
const getCabang = async () => {
  const [rows] = await db.query(
    `SELECT cbg_kode AS kode, cbg_nama AS nama FROM tcabang ORDER BY cbg_kode`
  );
  return rows;
};

// ── Lookup Gudang milik satu cabang (gudang penerima cabang tujuan) ──
const getGudang = async (cabangKode) => {
  if (!cabangKode) return [];
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama
       FROM tgudang
      WHERE gdg_cbg_kode = ?
      ORDER BY gdg_nama`,
    [cabangKode]
  );
  return rows;
};

// ── Cari Mutasi Out yang belum diterima (tujuan = cabang user) ───────
const searchMutasiOut = async (cabangTujuan) => {
  const [rows] = await db.query(
    `SELECT
       a.mutc_nomor AS nomor,
       DATE_FORMAT(a.mutc_tanggal, '%Y-%m-%d') AS tanggal,
       b.cbg_nama AS asal,
       c.cbg_nama AS tujuan
     FROM tmutcab_hdr a
     INNER JOIN tcabang b ON a.mutc_cbg_asal = b.cbg_kode
     INNER JOIN tcabang c ON a.mutc_cbg_tujuan = c.cbg_kode
     LEFT JOIN tmutcabin_hdr d ON a.mutc_nomor = d.mutci_nomormutasi
     WHERE d.mutci_nomor IS NULL
       AND a.mutc_cbg_tujuan = ?
       AND a.mutc_status = 0
     ORDER BY a.mutc_nomor`,
    [cabangTujuan]
  );
  return rows;
};

// ── Load Data Mutasi Out (satu DB sentral → langsung) ────────────────
const loadDataMutasi = async (nomorMutasi) => {
  const [rows] = await db.query(
    `SELECT
       a.mutc_nomor AS nomor,
       DATE_FORMAT(a.mutc_tanggal, '%Y-%m-%d') AS tanggal,
       a.mutc_cbg_asal AS cabangAsal,
       a.mutc_cbg_tujuan AS cabangTujuan,
       b.mutcd_brg_kode AS sku,
       c.brg_nama AS namaBarang,
       c.brg_satuan AS satuan,
       b.mutcd_qty AS qty,
       DATE_FORMAT(b.mutcd_expired, '%Y-%m-%d') AS expired,
       IFNULL(b.mutcd_keterangan, '') AS keterangan,
       b.mutcd_harga AS harga
     FROM tmutcab_hdr a
     INNER JOIN tmutcab_dtl b ON a.mutc_nomor = b.mutcd_mutc_nomor
     INNER JOIN tbarang c ON b.mutcd_brg_kode = c.brg_kode
     WHERE a.mutc_nomor = ?
     ORDER BY b.mutcd_nourut`,
    [nomorMutasi]
  );

  if (rows.length === 0) throw new Error("Nomor mutasi tidak ditemukan.");

  return {
    nomor: rows[0].nomor,
    tanggal: rows[0].tanggal,
    cabangAsal: rows[0].cabangAsal,
    cabangTujuan: rows[0].cabangTujuan,
    detail: rows.map((r, i) => ({
      no: i + 1,
      sku: r.sku,
      namaBarang: r.namaBarang,
      satuan: r.satuan,
      qty: r.qty,
      expired: r.expired || "",
      keterangan: r.keterangan,
      harga: r.harga,
    })),
  };
};

// ── Load Form Edit ───────────────────────────────────────────────────
const getDetailForm = async (nomor) => {
  const [[header]] = await db.query(
    `SELECT
       mutci_nomor AS nomor,
       DATE_FORMAT(mutci_tanggal, '%Y-%m-%d') AS tanggal,
       mutci_nomormutasi AS nomorMutasi,
       mutci_cbg_asal AS cabangAsal,
       mutci_cbg_tujuan AS cabangTujuan,
       mutci_gdg_kode AS gudang
     FROM tmutcabin_hdr
     WHERE mutci_nomor = ?`,
    [nomor]
  );

  if (!header) throw new Error("Mutasi cabang in tidak ditemukan.");

  const [detailRows] = await db.query(
    `SELECT
       d.mutcid_brg_kode AS sku,
       b.brg_nama AS namaBarang,
       b.brg_satuan AS satuan,
       d.mutcid_qty AS qty,
       DATE_FORMAT(d.mutcid_expired, '%Y-%m-%d') AS expired,
       IFNULL(d.mutcid_keterangan, '') AS keterangan,
       d.mutcid_harga AS harga
     FROM tmutcabin_dtl d
     INNER JOIN tbarang b ON b.brg_kode = d.mutcid_brg_kode
     WHERE d.mutcid_mutci_nomor = ?
     ORDER BY d.mutcid_nourut`,
    [nomor]
  );

  return {
    ...header,
    detail: detailRows.map((d, i) => ({ no: i + 1, ...d })),
  };
};

// ── Save Data ────────────────────────────────────────────────────────
const saveData = async (payload, user) => {
  const {
    isEdit, nomor, tanggal, nomorMutasi, cabangAsal, cabangTujuan,
    gudang, detail,
  } = payload;

  const cabangLogin = String(user?.cabang || "00");
  let lockKey = null;
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    // ── Validasi ─────────────────────────────────────────────────────
    if (await cekTutupPeriode(tanggal)) {
      throw new Error("Periode ini sudah di tutup.");
    }
    if (!gudang) throw new Error("Gudang belum di pilih.");
    if (!cabangAsal || !cabangTujuan) throw new Error("Cabang belum di pilih.");
    if (cabangAsal === cabangTujuan)
      throw new Error("Cabang Asal tidak boleh sama dengan Cabang Tujuan.");

    // User cabang hanya menerima mutasi untuk cabangnya sendiri
    if (cabangLogin !== "00" && cabangTujuan !== cabangLogin) {
      throw new Error("Cabang tujuan harus sama dengan cabang user yang login.");
    }

    // Gudang penerima wajib milik cabang tujuan
    const [[gdg]] = await conn.query(
      `SELECT gdg_cbg_kode FROM tgudang WHERE gdg_kode = ?`, [gudang]
    );
    if (!gdg) throw new Error(`Gudang ${gudang} tidak ditemukan.`);
    if ((gdg.gdg_cbg_kode || "00") !== cabangTujuan) {
      throw new Error("Gudang penerima tidak sesuai dengan cabang tujuan.");
    }

    const validDetail = (detail || []).filter(
      (d) => Number(d.qty) > 0 && d.sku && String(d.sku) !== "0"
    );
    if (validDetail.length === 0)
      throw new Error("Detail mutasi kosong. Isi minimal satu baris barang.");

    let actualNomor = nomor;

    // Cegah terima ulang mutasi out yang sama
    if (!isEdit) {
      const [[out]] = await conn.query(
        `SELECT mutc_status FROM tmutcab_hdr WHERE mutc_nomor = ?`,
        [nomorMutasi]
      );
      if (!out) throw new Error("Nomor mutasi (OUT) tidak ditemukan.");
      if (Number(out.mutc_status) !== 0)
        throw new Error("Mutasi OUT sudah berstatus diterima/diproses.");

      const [[sudah]] = await conn.query(
        `SELECT 1 AS x FROM tmutcabin_hdr WHERE mutci_nomormutasi = ? LIMIT 1`,
        [nomorMutasi]
      );
      if (sudah) throw new Error("Mutasi OUT ini sudah pernah diterima.");
    }

    if (isEdit) {
      await conn.query(
        `UPDATE tmutcabin_hdr SET
           mutci_tanggal = ?, mutci_nomormutasi = ?, mutci_gdg_kode = ?,
           mutci_cbg_asal = ?, mutci_cbg_tujuan = ?,
           date_modified = NOW(), user_modified = ?
         WHERE mutci_nomor = ?`,
        [tanggal, nomorMutasi, gudang, cabangAsal, cabangTujuan, user.kode, nomor]
      );

      // detail lama dihapus → trigger membalikkan stok gudang penerima
      await conn.query(
        `DELETE FROM tmutcabin_dtl WHERE mutcid_mutci_nomor = ?`, [actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      lockKey = `nomor_mtci_${cabangTujuan}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      await acquireLock(conn, lockKey);
      actualNomor = await getMaxNomor(tanggal, cabangTujuan);
      await conn.query(
        `INSERT INTO tmutcabin_hdr
           (mutci_nomor, mutci_tanggal, mutci_nomormutasi, mutci_cbg_asal,
            mutci_cbg_tujuan, mutci_gdg_kode, date_create, user_create)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [actualNomor, tanggal, nomorMutasi, cabangAsal, cabangTujuan, gudang, user.kode]
      );
    }

    // Insert detail baru (trigger menaikkan stok gudang penerima;
    // trigger menulis mst_hargabeli & mst_avgcost = harga mutasi/HPP yang
    // dibawa dari mutasi OUT)
    let nourut = 1;
    for (const dr of validDetail) {
      await conn.query(
        `INSERT INTO tmutcabin_dtl
           (mutcid_mutci_nomor, mutcid_brg_kode, mutcid_qty, mutcid_harga,
            mutcid_keterangan, mutcid_expired, mutcid_nourut, mutcid_pb_nomor)
         VALUES (?, ?, ?, ?, ?, ?, ?, '')`,
        [
          actualNomor, dr.sku, dr.qty, dr.harga || 0,
          dr.keterangan || "", dr.expired || "0000-00-00", nourut,
        ]
      );
      nourut++;
    }

    // Jurnal mutasi IN: Dr Persediaan cabang tujuan vs Cr Persediaan Intransit
    await createAutoJurnalMutasiIn(conn, { nomor: actualNomor, user: user.kode });

    // Tandai mutasi OUT sebagai sudah diterima (atomik dgn simpan IN)
    await conn.query(
      `UPDATE tmutcab_hdr SET mutc_status = 1 WHERE mutc_nomor = ?`,
      [nomorMutasi]
    );

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    if (lockKey) { try { await releaseLock(conn, lockKey); } catch { /* noop */ } }
    conn.release();
  }
};

module.exports = {
  getMaxNomor,
  getCabang,
  getGudang,
  searchMutasiOut,
  loadDataMutasi,
  getDetailForm,
  saveData,
};
