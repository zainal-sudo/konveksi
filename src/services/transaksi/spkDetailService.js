const db = require("../../config/database");

// Daftar Master Proses AKTIF untuk dropdown "Kategori Proses" di form SPK.
const getKategoriList = async () => {
  const [rows] = await db.query(
    `SELECT prs_kode AS kode, prs_nama AS nama, prs_keterangan AS keterangan,
            prs_jasa AS jasa
     FROM tmaster_proses
     WHERE prs_aktif = 1
     ORDER BY prs_kode ASC`
  );
  return rows;
};



// PENTING: dtl_selesai, dtl_target, dan dtl_status SENGAJA TIDAK BOLEH
// ditulis lewat endpoint ini. Ketiganya adalah "source of truth" progres
// produksi yang hanya boleh berubah lewat insert LHK (yang divalidasi
// ketat oleh trigger trg_tlhk_hdr_before_insert + SP sp_lhk_proses_tahap).
//
// ⚠️ Endpoint ini sekarang DINONAKTIFKAN (2026-10-08). Satu-satunya kolom
// yang boleh ditulis sebelumnya (dtl_pic, dtl_keterangan) sudah di-drop
// karena tidak pernah diisi dari layar — sisa kolom dtl_tgl_mulai /
// dtl_tgl_selesai juga di-drop (keduanya dihitung dari LHK, bukan manual).
// Fungsi tetap diekspor supaya route/controller lama tetap resolve dan
// mengembalikan pesan jelas, bukan "Unknown column".
const updateDetail = async () => {
  throw new Error(
    "Endpoint update detail SPK dinonaktifkan: kolom dtl_pic & dtl_keterangan sudah dihapus."
  );
};

const deleteDetailBySpk = async (spkNomor) => {
  await db.query(`DELETE FROM tspk_dtl WHERE dtl_spk_nomor = ?`, [spkNomor]);
};

const getTemplateByKategori = async (connOrPool, prsKode) => {
  const [rows] = await connOrPool.query(
    `SELECT prsd_id AS id, prsd_urutan AS urutan, prsd_nama AS nama,
            prsd_finalisasi_stok AS finalisasi,
            prsd_jasa AS jasa
     FROM tmaster_proses_dtl
     WHERE prsd_prs_kode = ?
     ORDER BY prsd_urutan ASC`,
    [prsKode]
  );
  return rows;
};

const generateDetailForSpk = async (conn, spkNomor, prsKode, target) => {
  if (!prsKode) return;

  const template = await getTemplateByKategori(conn, prsKode);
  if (template.length === 0) return;

  for (const t of template) {
    // dtl_jasa = snapshot flag jasa dari tmaster_proses_dtl.prsd_jasa.
    // Dipakai LHK (getTahapBySpk) untuk menembak tlhk_jasa_stok, bukan
    // tlhk_proses_tahap. Default 0 = proses produk (perilaku lama).
    await conn.query(
      `INSERT INTO tspk_dtl (dtl_spk_nomor, dtl_urutan, dtl_nama, dtl_target, dtl_finalisasi, dtl_jasa, dtl_status)
       VALUES (?, ?, ?, ?, ?, ?, 'Belum Mulai')`,
      [spkNomor, t.urutan, t.nama, target || 0, t.finalisasi ? 1 : 0, t.jasa ? 1 : 0]
    );
  }
};

// ⚠️ tspk_dtl adalah SNAPSHOT tmaster_proses_dtl saat SPK dibuat
// (generateDetailForSpk hanya dipanggil sekali di spkFormService.saveData).
// Kalau Master Proces-nya lalu ditambah tahap baru, SPK LAMA tidak ikut
// bertambah — tahap baru ada di database tapi tidak pernah muncul di LHK,
// sehingga tahap terakhir mustahil dipilih dan SPK tidak pernah 'Selesai'.
//
// Fungsi ini men-backfill tahap yang HILANG saja. Baris lama tidak pernah
// disentuh (dtl_target/selesai/status adalah source of truth progres LHK),
// dan aman dipanggil berkali-kali karena pakai dtl_urutan sebagai identitas.
const syncDetailForSpk = async (conn, spkNomor, prsKode) => {
  const clean = String(spkNomor || "").trim();
  if (!clean) throw new Error("Nomor SPK wajib diisi.");
  if (!prsKode)
    throw new Error("SPK ini tidak punya Master Proses, tidak ada template untuk disinkronkan.");

  const template = await getTemplateByKategori(conn, prsKode);
  if (template.length === 0) throw new Error("Master Proses ini belum punya tahapan.");

  const [[spk]] = await conn.query(
    `SELECT spk_jumlah FROM tspk WHERE TRIM(spk_nomor) = TRIM(?)`,
    [clean]
  );
  if (!spk) throw new Error("SPK tidak ditemukan.");

  const [existing] = await conn.query(
    `SELECT dtl_urutan AS urutan, IFNULL(dtl_selesai, 0) AS selesai
       FROM tspk_dtl
      WHERE TRIM(dtl_spk_nomor) = TRIM(?)`,
    [clean]
  );
  const byUrutan = new Map(existing.map((r) => [Number(r.urutan), Number(r.selesai) || 0]));

  const missing = template.filter((t) => !byUrutan.has(Number(t.urutan)));
  const added = [];
  for (const t of missing) {
    const u = Number(t.urutan);

    // Target tahap baru = qty BAIK dari tahap sebelumnya (BS tidak
    // diteruskan) — aturan sama dengan trigger tlhk_proses_tahap.
    // Kalau tidak ada tahap sebelumnya, target = qty SPK.
    let target = null;
    let prevBest = -Infinity;
    for (const [prevUrutan, prevSelesai] of byUrutan) {
      if (prevUrutan < u && prevUrutan > prevBest) {
        prevBest = prevUrutan;
        target = prevSelesai;
      }
    }
    if (target === null) target = Number(spk.spk_jumlah) || 0;

    await conn.query(
      `INSERT INTO tspk_dtl (dtl_spk_nomor, dtl_urutan, dtl_nama, dtl_target, dtl_finalisasi, dtl_jasa, dtl_status)
       VALUES (?, ?, ?, ?, ?, ?, 'Belum Mulai')`,
      [clean, u, t.nama, target, t.finalisasi ? 1 : 0, t.jasa ? 1 : 0]
    );
    byUrutan.set(u, 0);
    added.push({ urutan: u, nama: t.nama, target });
  }

  return { added: added.length, stages: added };
};

const getDetailBySpk = async (spkNomor) => {
  const [rows] = await db.query(
    `SELECT
        dtl_id          AS id,
        dtl_urutan      AS urutan,
        dtl_nama        AS nama,
        dtl_target      AS target,
        dtl_selesai     AS selesai,
        dtl_finalisasi  AS finalisasi,
        dtl_jasa        AS jasa,
        dtl_status      AS status
     FROM tspk_dtl
     WHERE dtl_spk_nomor = ?
     ORDER BY dtl_urutan ASC`,
    [spkNomor]
  );
  return rows;
};

module.exports = {
  getKategoriList,
  getTemplateByKategori,
  generateDetailForSpk,
  syncDetailForSpk,
  getDetailBySpk,
  updateDetail,
  deleteDetailBySpk,
};