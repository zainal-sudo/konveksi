const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");
const { deleteAutoJurnalMutasiCabang } = require("../../utils/jurnalMutasiCabang");

/**
 * Browse Mutasi Cabang Out (paritas lama bsmcabang, satu DB sentral).
 * - User cabang: hanya data mutasi cabangnya sendiri (asal).
 * - Pusat ('00'): boleh filter per cabang (param cab) atau lihat semua.
 */
const getBrowse = async (startDate, endDate, cabang) => {
  const params = [startDate, endDate];
  let where = "WHERE a.mutc_tanggal BETWEEN ? AND ?";
  if (cabang && cabang !== "ALL") {
    where += " AND a.mutc_cbg_asal = ?";
    params.push(cabang);
  }

  const [rows] = await db.query(
    `SELECT
       a.mutc_nomor AS Nomor,
       DATE_FORMAT(a.mutc_tanggal, '%Y-%m-%d') AS Tanggal,
       c.cbg_nama AS Asal,
       b.cbg_nama AS Tujuan,
       d.gdg_nama AS Gudang,
       IFNULL(a.mutc_keterangan, '') AS Keterangan,
       IF(a.mutc_status = 1, 'Sudah Diterima', 'Belum') AS Realisasi
     FROM tmutcab_hdr a
     INNER JOIN tcabang b ON b.cbg_kode = a.mutc_cbg_tujuan
     INNER JOIN tcabang c ON c.cbg_kode = a.mutc_cbg_asal
     INNER JOIN tgudang d ON d.gdg_kode = a.mutc_gdg_kode
     ${where}
     GROUP BY a.mutc_nomor, a.mutc_tanggal, a.mutc_keterangan
     ORDER BY a.mutc_nomor DESC`,
    params
  );
  return rows;
};

const getBrowseDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       h.mutc_nomor AS Nomor,
       d.mutcd_brg_kode AS Kode,
       b.brg_nama AS Nama,
       d.mutcd_qty AS Jumlah,
       DATE_FORMAT(d.mutcd_expired, '%Y-%m-%d') AS Expired,
       IFNULL(d.mutcd_keterangan, '') AS Keterangan,
       g.gdg_nama AS Gudang
     FROM tmutcab_dtl d
     INNER JOIN tmutcab_hdr h ON h.mutc_nomor = d.mutcd_mutc_nomor
     INNER JOIN tbarang b ON b.brg_kode = d.mutcd_brg_kode
     INNER JOIN tgudang g ON g.gdg_kode = d.mutcd_gdg_kode
     WHERE d.mutcd_mutc_nomor = ?
     ORDER BY d.mutcd_nourut`,
    [nomor]
  );
  return rows;
};

// ── Hapus Mutasi Cabang Out ───────────────────────────────────────────
// Hanya yang belum diterima cabang tujuan (mutc_status = 0).
// Trigger DB (tmutcab_dtl after_delete) otomatis membalikkan stok gudang asal.
const deleteData = async (nomor, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const [[hdr]] = await conn.query(
      `SELECT mutc_nomor, mutc_status, mutc_tanggal
         FROM tmutcab_hdr WHERE mutc_nomor = ? FOR UPDATE`,
      [nomor]
    );
    if (!hdr) throw new Error("Data mutasi cabang tidak ditemukan.");
    if (Number(hdr.mutc_status) === 1)
      throw new Error("Transaksi sudah Diterima cabang tujuan. Tidak bisa dihapus.");

    // Jurnal otomatis yang sudah diclose tidak boleh dihapus
    const [[jur]] = await conn.query(
      `SELECT jur_isclosed FROM tjurnal WHERE jur_no = ?`,
      [nomor]
    );
    if (jur && Number(jur.jur_isclosed) !== 0)
      throw new Error("Jurnal transaksi sudah diclose. Tidak bisa dihapus.");

    if (await cekTutupPeriode(hdr.mutc_tanggal))
      throw new Error("Periode sudah ditutup. Tidak bisa dihapus.");

    // detail dihapus dulu → trigger membalikkan stok gudang asal & HPP
    await conn.query(`DELETE FROM tmutcab_dtl WHERE mutcd_mutc_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tmutcab_hdr WHERE mutc_nomor = ?`, [nomor]);
    // hapus jurnal otomatis MTC-OUT (nomor jurnal = nomor dokumen)
    await deleteAutoJurnalMutasiCabang(conn, nomor);

    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Data cetak Surat Jalan (dot matrix / QZ Tray) ─────────────────────
const getPrintData = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT
       h.mutc_nomor AS nomor,
       DATE_FORMAT(h.mutc_tanggal, '%d/%m/%Y') AS tanggal,
       IFNULL(h.mutc_keterangan, '') AS keterangan,
       IFNULL(h.user_create, '') AS usr,
       da.cbg_nama AS cabangAsal,
       dt.cbg_nama AS cabangTujuan,
       g.gdg_nama AS gudang,
       u.user_nama AS userNama
     FROM tmutcab_hdr h
     LEFT JOIN tcabang da ON da.cbg_kode = h.mutc_cbg_asal
     LEFT JOIN tcabang dt ON dt.cbg_kode = h.mutc_cbg_tujuan
     LEFT JOIN tgudang g ON g.gdg_kode = h.mutc_gdg_kode
     LEFT JOIN tuser u ON u.user_kode = h.user_create
     WHERE h.mutc_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("Data mutasi cabang tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT
       d.mutcd_nourut AS no,
       d.mutcd_brg_kode AS kode,
       b.brg_nama AS nama,
       b.brg_satuan AS satuan,
       d.mutcd_qty AS jumlah,
       IFNULL(d.mutcd_keterangan, '') AS keterangan
     FROM tmutcab_dtl d
     LEFT JOIN tbarang b ON b.brg_kode = d.mutcd_brg_kode
     WHERE d.mutcd_mutc_nomor = ?
     ORDER BY d.mutcd_nourut ASC`,
    [nomor]
  );

  const [[perusahaan]] = await db.query(
    `SELECT perush_nama, perush_alamat, perush_kota, perush_NOtelp
     FROM tperusahaan LIMIT 1`
  );

  return {
    ...h,
    userNama: h.userNama || h.usr,
    perusahaan: perusahaan
      ? {
          nama: perusahaan.perush_nama,
          alamat: perusahaan.perush_alamat,
          kota: perusahaan.perush_kota,
          notelp: perusahaan.perush_NOtelp,
        }
      : { nama: "", alamat: "", kota: "", notelp: "" },
    detail,
  };
};

module.exports = { getBrowse, getBrowseDetail, deleteData, getPrintData };
