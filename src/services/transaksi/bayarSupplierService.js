const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

// 0. Lookup Supplier & Rekening milik modul Bayar Supplier sendiri.
// PENTING: sebelumnya form ini memakai returFormApi (modul Retur, menuId 16)
// untuk pencarian supplier/rekening. Kalau user tidak punya akses ke menu
// Retur, request itu ditolak (403) walau dia punya akses ke menu Bayar
// Supplier (53) -- akibatnya modal pilih supplier selalu kosong.
const getSupplierOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT sup_kode AS kode, sup_nama AS nama FROM tsupplier 
     WHERE sup_nama LIKE ? OR sup_kode LIKE ? ORDER BY sup_nama LIMIT 50`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getRekeningOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT rek_kode AS kode, rek_nama AS nama FROM trekening 
     WHERE rek_nama LIKE ? OR rek_kode LIKE ? ORDER BY rek_nama LIMIT 50`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// 1. Fungsi Generate Nomor Transaksi Otomatis (VP.2606.0001)
// `runner` opsional: pass koneksi transaksi (conn) supaya query ini ikut
// terkunci dalam SAME lock (lihat generateNomorBuktiLocked). Tanpa
// argumen, dipakai pool biasa -- HANYA untuk preview di getInitData
// (tampilan awal form), BUKAN nomor final yang benar-benar dipakai saat
// simpan (lihat catatan di saveData()).
const generateNomorBukti = async (runner = db) => {
  const date = new Date();
  const year = date.getFullYear().toString().substring(2, 4); // "26"
  const month = (date.getMonth() + 1).toString().padStart(2, "0"); // "06"
  const prefix = `VP.${year}${month}.`; // "VP.2606."

  const [[runNumber]] = await runner.query(
    `SELECT MAX(SUBSTRING(bys_nomor, 9, 4)) AS last_num 
     FROM tbayarsup_hdr 
     WHERE bys_nomor LIKE ?`,
    [`${prefix}%`]
  );

  const nextNum = (parseInt(runNumber.last_num || 0) + 1).toString().padStart(4, "0");
  return { nomor: `${prefix}${nextNum}`, lockKey: `nomor_bayarsup_${year}${month}` };
};

// 2. Fungsi Mengambil Invoice Sisa Hutang saat Supplier Dipilih
// ─────────────────────────────────────────────────────────────────────
// ✅ FIX BUG: sebelumnya query ini pakai `inv_sup_kode` langsung dari
// tinv_hdr, padahal kolom itu TIDAK PERNAH diisi saat invoice dibuat
// (cek invFormService.saveData -- INSERT ke tinv_hdr tidak menyertakan
// inv_sup_kode sama sekali). Akibatnya invoice yang baru dibuat TIDAK
// PERNAH muncul di daftar sisa hutang sini walau datanya ada di Browse
// Invoice -- karena WHERE inv_sup_kode = ? selalu tidak match (NULL).
// Sekarang supplier diambil dengan cara yang sama seperti di
// invFormService & returFormService: Invoice → BPB → PO → Supplier.
// ─────────────────────────────────────────────────────────────────────
const getInvoiceHutang = async (supKode) => {
  const [rows] = await db.query(
    `SELECT 
      i.inv_nomor AS invoiceNomor, 
      DATE_FORMAT(i.inv_tanggal, '%Y-%m-%d') AS invoiceTanggal, 
      i.inv_amount AS invoiceNetto, 
      IFNULL(i.inv_bayar, 0) AS sudahDibayar,
      IFNULL(ret.totalRetur, 0) AS totalRetur,
      i.inv_amount - i.inv_bayar - IFNULL(ret.totalRetur, 0) AS sisaHutang,
      0 AS nilaiBayar, -- default awal di tabel sebelum dicentang
      0 AS isChecked    -- penanda centang awal
     FROM tinv_hdr i
     LEFT JOIN tbpb_hdr h ON i.inv_bpb_nomor = h.bpb_nomor
     LEFT JOIN tpo_hdr p  ON h.bpb_po_nomor = p.po_nomor
     LEFT JOIN (
       SELECT ret_inv_nomor, SUM(ret_amount) AS totalRetur
       FROM tret_hdr GROUP BY ret_inv_nomor
     ) ret ON ret.ret_inv_nomor = i.inv_nomor
     WHERE p.po_sup_kode = ? AND (i.inv_amount - i.inv_bayar - IFNULL(ret.totalRetur, 0)) > 0
     ORDER BY i.inv_tanggal ASC`,
    [supKode]
  );
  return rows;
};

// CARA_BAYAR diturunkan dari data (kolom bys_cara tidak ada lagi di skema):
//  - bys_nogiro terisi  -> "GIRO"   (sesuai logika trigger tbayarsup_hdr_after_update)
//  - bys_nogiro kosong  -> "TUNAI"
const CARA_BAYAR_CASE = `
  CASE
    WHEN h.bys_nogiro IS NOT NULL AND h.bys_nogiro <> '' THEN 'GIRO'
    ELSE 'TUNAI'
  END
`;

const getAllHistory = async (startDate = null, endDate = null) => {
  const [rows] = await db.query(
    `SELECT 
      h.bys_nomor AS NOMOR,
      DATE_FORMAT(h.bys_tanggal, '%Y-%m-%d') AS TANGGAL,
      h.bys_memo AS MEMO,
      h.bys_sup_kode AS SUP_KODE,
      s.sup_nama AS SUP_NAMA,
      h.bys_rek_kode AS REK_KODE,
      r.rek_nama AS REK_NAMA,
      ${CARA_BAYAR_CASE} AS CARA_BAYAR,
      h.bys_nogiro AS NO_GIRO,
      DATE_FORMAT(h.bys_tglcair, '%Y-%m-%d') AS TGL_CAIR,
      h.bys_nilai AS TOTAL_BAYAR,
      IF(EXISTS (
        SELECT 1 FROM tbayarsup_dtl d
        INNER JOIN tinv_hdr i ON d.bysd_inv_nomor = i.inv_nomor
        WHERE d.bysd_bys_nomor = h.bys_nomor AND i.inv_istax > 0
      ), 'Ya', 'Tidak') AS TAX
     FROM tbayarsup_hdr h
     LEFT JOIN tsupplier s ON h.bys_sup_kode = s.sup_kode
     LEFT JOIN trekening r ON h.bys_rek_kode = r.rek_kode
     WHERE (? IS NULL OR h.bys_tanggal >= ?)
       AND (? IS NULL OR h.bys_tanggal <= ?)
     ORDER BY h.bys_nomor DESC`,
    [startDate || null, startDate || null, endDate || null, endDate || null]
  );
  return rows;
};

// ─────────────────────────────────────────────────────────────────────
// PENTING: tinv_hdr.inv_bayar & inv_isbayar TIDAK di-update manual di
// sini. Trigger tbayarsup_dtl_after_delete di database sudah otomatis
// mengurangi inv_bayar begitu baris tbayarsup_dtl dihapus. Kalau kita
// update manual juga, nilainya akan berkurang DUA KALI.
// ─────────────────────────────────────────────────────────────────────
const deleteTransaksi = async (nomorBukti) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
  try {
    // Hapus detail dulu -> trigger tbayarsup_dtl_after_delete otomatis
    // mengembalikan inv_bayar & inv_isbayar di tinv_hdr per baris.
    await connection.query(`DELETE FROM tbayarsup_dtl WHERE bysd_bys_nomor = ?`, [nomorBukti]);
    await connection.query(`DELETE FROM tbayarsup_hdr WHERE bys_nomor = ?`, [nomorBukti]);

    await connection.commit();
    return true;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
};

const saveData = async (payload) => {
  const { header, totalBayar, details } = payload;
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    // ✅ FIX: sebelumnya `nomorBukti` dipakai APA ADANYA dari nilai yang
    // ditampilkan saat form dibuka (getInitData -> generateNomorBukti
    // dipanggil sekali, terpisah dari transaksi simpan). Kalau 2 user
    // buka form baru di waktu berdekatan, keduanya akan melihat nomor
    // preview yang SAMA, dan berdua bisa submit dengan nomor yang sama
    // persis -- bukan cuma race-condition tipis, tapi bug yang cukup
    // gampang kejadian. Sekarang untuk data baru, nomor digenerate ULANG
    // di sini, di dalam transaksi yang sama & dikunci (GET_LOCK), jadi
    // nomor final dijamin unik walau preview di FE sudah basi.
    let nomorBukti = header.nomorBukti;
    if (!header.isEdit) {
      const date = new Date();
      const yy = date.getFullYear().toString().substring(2, 4);
      const mm = (date.getMonth() + 1).toString().padStart(2, "0");
      lockKey = `nomor_bayarsup_${yy}${mm}`;
      // Kunci DULU, baru hitung nomor -- supaya tidak ada celah antara
      // "baca max nomor" dan "dapat lock" seperti kalau urutannya dibalik.
      await acquireLock(conn, lockKey);
      const generated = await generateNomorBukti(conn);
      nomorBukti = generated.nomor;
    }
    const now = new Date();

    // noGiro & tglCair opsional dari form. Kalau noGiro kosong, dianggap Tunai/Transfer.
    const noGiro = header.noGiro || null;
    const tglCair = noGiro ? (header.tglCair || null) : null;

    if (header.isEdit) {
      // ── EDIT: hapus dulu detail lama ────────────────────────────
      // Trigger tbayarsup_dtl_after_delete otomatis mengembalikan
      // inv_bayar di tinv_hdr untuk tiap baris yang dihapus -- JANGAN
      // di-update manual lagi di sini (lihat catatan di deleteTransaksi).
      await conn.query(
        `DELETE FROM tbayarsup_dtl WHERE bysd_bys_nomor = ?`,
        [nomorBukti]
      );

      // UPDATE header ini akan memicu trigger tbayarsup_hdr_after_update,
      // yang otomatis hapus+buat ulang jurnal (pakai bys_tglcair kalau
      // bys_nogiro terisi, atau bys_tanggal kalau tidak).
      await conn.query(
        `UPDATE tbayarsup_hdr
         SET bys_tanggal=?, bys_rek_kode=?, bys_nogiro=?, bys_tglcair=?,
              bys_memo=?,
             bys_nilai=?, date_modified=?
         WHERE bys_nomor=?`,
        [
          header.tanggal,
          header.rekKode,
          noGiro,
          tglCair,
          header.catatan || "",
          totalBayar,
          now,
          nomorBukti,
        ]
      );
    } else {
      // ── INSERT baru ────────────────────────────────────────────
      // Trigger tbayarsup_hdr_after_insert otomatis membuat jurnal
      // begitu baris ini masuk.
      await conn.query(
        `INSERT INTO tbayarsup_hdr
           (bys_nomor, bys_tanggal, bys_sup_kode, bys_rek_kode, bys_nogiro, bys_tglcair,
             bys_memo, bys_nilai, date_create)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nomorBukti,
          header.tanggal,
          header.supKode,
          header.rekKode,
          noGiro,
          tglCair,
          header.catatan || "",
          totalBayar,
          now,
        ]
      );
    }

    // ✅ FIX: sebelumnya `dt.nilaiBayar` langsung di-INSERT tanpa dicek
    // ulang terhadap sisa hutang invoice di server -- kalau payload
    // dikirim/dimodif di luar validasi FE, bisa bayar melebihi sisa
    // hutang (bahkan bikin inv_bayar > inv_amount). Validasi ulang di
    // sini pakai data invoice TERKINI dari DB (bukan dari payload
    // client), dilakukan setelah trigger DELETE detail lama sudah jalan
    // (untuk mode edit) supaya sisaHutang sudah mencerminkan kondisi
    // "sebelum pembayaran/perubahan ini".
    for (const dt of details) {
      const nilaiBayar = Number(dt.nilaiBayar) || 0;
      if (nilaiBayar <= 0) continue;

      const [[invRow]] = await conn.query(
        `SELECT inv_amount, IFNULL(inv_bayar, 0) AS inv_bayar,
                IFNULL((SELECT SUM(ret_amount) FROM tret_hdr WHERE ret_inv_nomor = inv_nomor), 0) AS totalRetur
         FROM tinv_hdr WHERE inv_nomor = ? FOR UPDATE`,
        [dt.invoiceNomor]
      );
      if (!invRow) {
        throw new Error(`Invoice "${dt.invoiceNomor}" tidak ditemukan.`);
      }
      const sisaHutang = Number(invRow.inv_amount) - Number(invRow.inv_bayar) - Number(invRow.totalRetur);
      if (nilaiBayar > sisaHutang) {
        throw new Error(
          `Nilai bayar untuk invoice "${dt.invoiceNomor}" (${nilaiBayar}) melebihi sisa hutang (${sisaHutang}).`
        );
      }
    }

    // ── Insert detail baru ──────────────────────────────────────
    // Trigger tbayarsup_dtl_after_insert otomatis menambah inv_bayar
    // & set inv_isbayar=1 di tinv_hdr untuk tiap baris ini -- JANGAN
    // di-update manual lagi di sini.
    for (const dt of details) {
      await conn.query(
        `INSERT INTO tbayarsup_dtl
           (bysd_bys_nomor, bysd_inv_nomor, bysd_bayar)
         VALUES (?, ?, ?)`,
        [nomorBukti, dt.invoiceNomor, dt.nilaiBayar]
      );
    }

    await conn.commit();
    return { nomor: nomorBukti };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    if (lockKey) await releaseLock(conn, lockKey);
    conn.release();
  }
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT
       h.bys_nomor        AS nomorBukti,
       DATE_FORMAT(h.bys_tanggal, '%Y-%m-%d') AS tanggal,
       h.bys_sup_kode     AS supKode,
       s.sup_nama         AS supNama,
       h.bys_rek_kode     AS rekKode,
       r.rek_nama         AS rekNama,
       h.bys_nogiro       AS noGiro,
       DATE_FORMAT(h.bys_tglcair, '%Y-%m-%d') AS tglCair,
       ${CARA_BAYAR_CASE} AS caraBayar,

       IFNULL(h.bys_memo, '') AS catatan,
       h.bys_nilai        AS totalBayar
     FROM tbayarsup_hdr h
     LEFT JOIN tsupplier s ON h.bys_sup_kode = s.sup_kode
     LEFT JOIN trekening r ON h.bys_rek_kode = r.rek_kode
     WHERE h.bys_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("Data pembayaran tidak ditemukan.");

  // Ambil semua invoice supplier + tandai yang sudah dibayar di nota ini
  // (fix bug inv_sup_kode sama seperti getInvoiceHutang di atas: supplier
  // diambil lewat join Invoice → BPB → PO, bukan kolom inv_sup_kode yang
  // tidak pernah diisi.)
  const [invoices] = await db.query(
    `SELECT
       inv.inv_nomor      AS invoiceNomor,
       DATE_FORMAT(inv.inv_tanggal, '%Y-%m-%d') AS invoiceTanggal,
       inv.inv_amount     AS invoiceNetto,
       -- sisa hutang SEBELUM pembayaran ini (kembalikan dulu nilai yang dibayar)
       (inv.inv_amount - IFNULL(inv.inv_bayar, 0) + IFNULL(d.bysd_bayar, 0)) AS sisaHutang,
       IFNULL(d.bysd_bayar, 0)  AS nilaiBayar,
       IF(d.bysd_inv_nomor IS NOT NULL, 1, 0) AS isChecked
     FROM tinv_hdr inv
     LEFT JOIN tbpb_hdr bh ON inv.inv_bpb_nomor = bh.bpb_nomor
     LEFT JOIN tpo_hdr p   ON bh.bpb_po_nomor = p.po_nomor
     LEFT JOIN tbayarsup_dtl d
       ON d.bysd_inv_nomor = inv.inv_nomor AND d.bysd_bys_nomor = ?
     WHERE p.po_sup_kode = ?
       AND (
         d.bysd_inv_nomor IS NOT NULL
         OR
         (inv.inv_amount - IFNULL(inv.inv_bayar, 0)) > 0
       )
     ORDER BY inv.inv_tanggal ASC`,
    [nomor, h.supKode]
  );

  return { ...h, listInvoice: invoices };
};

// StatusBayar di sini mengikuti kondisi invoice TERKINI (setelah semua
// pembayaran, bukan cuma nota ini) -- sama seperti logika StatusBayar di
// invService.getBrowse, supaya konsisten dengan yang ditampilkan di
// Browse Invoice.
const getDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       d.bysd_inv_nomor  AS NoInvoice,
       DATE_FORMAT(i.inv_tanggal, '%Y-%m-%d') AS TglInvoice,
       i.inv_amount      AS TotalInvoice,
       d.bysd_bayar      AS NilaiBayar,
       CASE
         WHEN IFNULL(i.inv_bayar, 0) <= 0 THEN 'Belum'
         WHEN i.inv_bayar >= i.inv_amount THEN 'Lunas'
         ELSE 'Sebagian'
       END AS StatusBayar
     FROM tbayarsup_dtl d
     LEFT JOIN tinv_hdr i ON d.bysd_inv_nomor = i.inv_nomor
     WHERE d.bysd_bys_nomor = ?
     ORDER BY d.bysd_inv_nomor ASC`,
    [nomor]
  );
  return rows;
};
module.exports = {
  getSupplierOptions,
  getRekeningOptions,
  generateNomorBukti,
  getInvoiceHutang,
  getAllHistory,
  deleteTransaksi,
  getDetailForm,
  saveData,
  getDetail
};