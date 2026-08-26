const db = require("../../config/database");

// Daftar kategori (ktg_kode ASLI) yang PUNYA template tahapan, plus nama
// kategorinya dari tkategori, untuk ditampilkan di dropdown "Kategori Proses".
const getKategoriList = async () => {
  const [rows] = await db.query(
    `SELECT DISTINCT t.tpt_ktg_kode AS kode, k.ktg_nama AS nama
     FROM tspk_dtl_template t
     LEFT JOIN tkategori k ON k.ktg_kode = t.tpt_ktg_kode
     ORDER BY t.tpt_ktg_kode ASC`
  );
  return rows;
};

const getTemplateByKategori = async (conn, ktgKode) => {
  const [rows] = await conn.query(
    `SELECT tpt_urutan AS urutan, tpt_nama AS nama
     FROM tspk_dtl_template
     WHERE tpt_ktg_kode = ?
     ORDER BY tpt_urutan ASC`,
    [ktgKode]
  );
  return rows;
};

// Terima ktgKode langsung dari pilihan/konfirmasi user (kode asli tkategori)
const generateDetailForSpk = async (conn, spkNomor, ktgKode, target) => {
  if (!ktgKode) return;

  const template = await getTemplateByKategori(conn, ktgKode);
  if (template.length === 0) return;

  for (const t of template) {
    await conn.query(
      `INSERT INTO tspk_dtl (dtl_spk_nomor, dtl_urutan, dtl_nama, dtl_target, dtl_status)
       VALUES (?, ?, ?, ?, 'Belum Mulai')`,
      [spkNomor, t.urutan, t.nama, target || 0]
    );
  }
};

const getDetailBySpk = async (spkNomor) => {
  const [rows] = await db.query(
    `SELECT
        dtl_id          AS id,
        dtl_urutan      AS urutan,
        dtl_nama        AS nama,
        dtl_target      AS target,
        dtl_selesai     AS selesai,
        dtl_pic         AS pic,
        DATE_FORMAT(dtl_tgl_mulai, '%Y-%m-%d')   AS tglMulai,
        DATE_FORMAT(dtl_tgl_selesai, '%Y-%m-%d') AS tglSelesai,
        dtl_status      AS status,
        dtl_keterangan  AS keterangan
     FROM tspk_dtl
     WHERE dtl_spk_nomor = ?
     ORDER BY dtl_urutan ASC`,
    [spkNomor]
  );
  return rows;
};

const updateDetail = async (detailId, payload) => {
  const { selesai, pic, tglMulai, tglSelesai, status, keterangan } = payload;
  await db.query(
    `UPDATE tspk_dtl SET
        dtl_selesai = ?, dtl_pic = ?, dtl_tgl_mulai = ?, dtl_tgl_selesai = ?,
        dtl_status = ?, dtl_keterangan = ?
     WHERE dtl_id = ?`,
    [selesai || 0, pic || null, tglMulai || null, tglSelesai || null, status || "Belum Mulai", keterangan || "", detailId]
  );
};

const deleteDetailBySpk = async (spkNomor) => {
  await db.query(`DELETE FROM tspk_dtl WHERE dtl_spk_nomor = ?`, [spkNomor]);
};

// Cari ktg_kode langsung dari barang (satu hop, tanpa tabel mapping perantara),
// lalu cek apakah kode itu punya template tahapan.
// Return null kalau brg_ktg_kode kosong ATAU belum ada template untuk kode itu
// (bukan error — frontend akan minta user pilih manual kalau null).
const getKtgKodeIfHasTemplate = async (brgKode) => {
  const [[row]] = await db.query(
    `SELECT b.brg_ktg_kode AS ktgKode
     FROM tbarang b
     WHERE b.brg_kode = ?
       AND EXISTS (
         SELECT 1 FROM tspk_dtl_template t WHERE t.tpt_ktg_kode = b.brg_ktg_kode
       )`,
    [brgKode]
  );
  return row?.ktgKode || null;
};

module.exports = {
  getKategoriList,
  getTemplateByKategori,
  generateDetailForSpk,
  getDetailBySpk,
  updateDetail,
  deleteDetailBySpk,
  getKtgKodeIfHasTemplate,
};