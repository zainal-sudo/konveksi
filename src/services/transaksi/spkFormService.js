const db = require("../../config/database");
const detailSvc = require("./spkDetailService");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");
const { cariNomorBebas } = require("../../utils/nomorUtil");
const { isValidTanggal, validasiTanggal } = require("../../utils/validasiKeuangan");

const getBarangOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT
        brg_kode   AS kode,
        brg_kode   AS barcode,
        brg_nama   AS nama,
        brg_satuan AS satuan
     FROM tbarang
     WHERE brg_gr_kode = 1
       AND (brg_nama LIKE ? OR brg_kode LIKE ?)
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getCustomerOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT cus_kode AS kode, cus_nama AS nama, cus_alamat AS alamat
     FROM tcustomer
     WHERE cus_nama LIKE ? OR cus_kode LIKE ?
     LIMIT 15`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT
        spk_nomor            AS nomor,
        spk_nama             AS nama,
        spk_brg_kode         AS brgKode,
        (SELECT b.brg_nama   FROM tbarang b WHERE b.brg_kode = spk_brg_kode)   AS brgNama,
        (SELECT b.brg_satuan FROM tbarang b WHERE b.brg_kode = spk_brg_kode)   AS satuan,
        spk_prs_kode         AS prsKode,
        (SELECT p.prs_nama   FROM tmaster_proses p WHERE p.prs_kode = spk_prs_kode) AS prsNama,
        spk_cus_kode         AS custKode,
        (SELECT c.cus_nama   FROM tcustomer c WHERE c.cus_kode = spk_cus_kode) AS custNama,
        DATE_FORMAT(spk_tanggal, '%Y-%m-%d')  AS tanggal,
        DATE_FORMAT(spk_dateline, '%Y-%m-%d') AS dateline,
        spk_jumlah           AS jumlah,
        spk_jumlah_jadi      AS jumlahJadi,
        spk_keterangan       AS keterangan,
        spk_idbatch          AS idBatch,
        -- Revisi 2026-10-09: tanggal produksi, shift, No/Tgl PO, close status
        DATE_FORMAT(spk_tanggal_produksi, '%Y-%m-%d') AS tanggalProduksi,
        spk_shift            AS shift,
        spk_no_po            AS noPo,
        DATE_FORMAT(spk_tanggal_po, '%Y-%m-%d')     AS tanggalPo,
        spk_is_closed        AS isClosed,
        spk_memo_close       AS memoClose,
        DATE_FORMAT(spk_close_date, '%Y-%m-%d %H:%i') AS closeDate,
        spk_close_user       AS closeUser,
        -- Jejak audit (kolom baru 2026-10-13): siapa yang membuat SPK ini
        -- dan siapa yang terakhir mengubahnya. Ditampilkan di kolom USER
        -- pada browse SPK.
        spk_user_create      AS userCreate,
        DATE_FORMAT(spk_date_create,   '%Y-%m-%d %H:%i') AS dateCreate,
        spk_user_modified    AS userModified,
        DATE_FORMAT(spk_date_modified, '%Y-%m-%d %H:%i') AS dateModified
     FROM tspk WHERE spk_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("SPK tidak ditemukan.");
  // Versi konveksi tanpa LHK: flag dikirim 0 supaya form tidak pernah
  // terkunci karena "sudah ada LHK".
  h.hasLhk = 0;
  h.adaLhkFinal = 0;
  // Normalisasi sedikit di sini supaya frontend tidak perlu tahu bedanya
  // NULL (SPK lama, kolom baru belum diisi) dengan 0.
  h.isClosed = Number(h.isClosed || 0) === 1 ? 1 : 0;
  return h;
};

// Validasi inti diduplikasi di backend sebagai lapisan terakhir (tidak bisa
// dibypass walau request dikirim langsung ke API, di luar validasi FE).
const validatePayload = (payload) => {
  const { nama, brgKode, prsKode, jumlah, tanggal } = payload;

  if (!nama || !String(nama).trim()) {
    throw new Error("Nama SPK harus diisi.");
  }
  // Revisi 2026-10-13: dicek di sini (bukan cuma validasiTanggal di bawah)
  // supaya pesan errornya "harus diisi" dan bukan "tidak valid (format ...)"
  // yang menyesatkan. Tanggal Produksi divalidasi lewat normFieldBaru →
  // normTanggalWajib, dipanggil di saveData.
  if (!tanggal || !String(tanggal).trim()) {
    throw new Error("Tanggal Pembuatan SPK harus diisi.");
  }
  if (!brgKode || !String(brgKode).trim()) {
    throw new Error("Barang harus dipilih.");
  }
  if (!prsKode || !String(prsKode).trim()) {
    throw new Error("Kategori Proses harus dipilih.");
  }
  const jml = Number(jumlah) || 0;
  if (jml <= 0) {
    throw new Error("Quantity SPK harus lebih dari 0.");
  }
};

// ── Field baru SPK (revisi 2026-10-09) ───────────────────────────────────
// Tanggal PO & DateLine OPSIONAL: SPK lama belum punya PO, dan DateLine
// belum bisa diisi selama PO masuk belum punya deadline yang bisa
// dipercayai (revisi 2026-10-13). Kosong itu sah (disimpan NULL).
// Yang penting formatnya benar kalau diisi — string "abc"/"2026-02-31"
// ditolak di sini, bukan Diam-diam jadi NULL.
const normTanggalOpsional = (label, v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!isValidTanggal(s)) {
    throw new Error(`${label} tidak valid (format YYYY-MM-DD).`);
  }
  return s;
};

// Tanggal WAJIB (revisi 2026-10-13) — dipakai untuk Tanggal Produksi.
// Dipisah dari normTanggalOpsional karena pesan errornya harus berbeda:
// kosong harus bilang "harus diisi", bukan "tidak valid (format YYYY-MM-DD)"
// yang menyesatkan (kosong itu bukan soal format).
const normTanggalWajib = (label, v) => {
  const s = String(v ?? "").trim();
  if (!s) {
    throw new Error(`${label} harus diisi.`);
  }
  return normTanggalOpsional(label, s);
};

// Shift SPK = 1/2/3. Kosong -> 1 (sama dengan DEFAULT kolom di DB).
const normShift = (v) => {
  const n = Number(v);
  return [1, 2, 3].includes(n) ? n : 1;
};

const normFieldBaru = (payload) => ({
  // WAJIB (revisi 2026-10-13): form LHK menarik nilai ini sebagai info SPK,
  // dan pemilih SPK mengurutkan berdasarkan jarak tanggal ini ke hari ini —
  // kosong di keduanya jadi tidak berguna.
  tanggalProduksi: normTanggalWajib("Tanggal Produksi", payload.tanggalProduksi),
  shift: normShift(payload.shift),
  noPo: String(payload.noPo ?? "").trim() || null,
  tanggalPo: normTanggalOpsional("Tanggal PO", payload.tanggalPo),
});

const saveData = async (payload, user) => {
  validatePayload(payload);

  // ⬅️ BARU (validasi tanggal): cegah nomor "SPK.NaN.NaN.x" yang muncul
  // kalau tanggal invalid lolos sampai ke pembentukan prefix.
  validasiTanggal("Tanggal SPK", payload.tanggal);
  // ⬅️ DateLine OPSIONAL (revisi 2026-10-13): divalidasi formatnya HANYA kalau
  // diisi. Kalau kosong, tidak ada error dan kolom disimpan NULL — yang hilang
  // di print juga tidak ada barisnya, bukan "-".
  if (payload.dateline && String(payload.dateline).trim()) {
    validasiTanggal("DateLine SPK", payload.dateline);
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const {
      isEdit, nomor, nama, brgKode, prsKode, custKode, tanggal, dateline,
      jumlah, keterangan, idBatch,
    } = payload;
    const baru = normFieldBaru(payload);

    // ⬅️ BARU (2026-10-13): sumber jejak audit kolom USER di browse SPK.
    // Dipakai untuk spk_user_create (saat create) dan spk_user_modified
    // (saat edit). Polanya sama dengan lhkService.saveData.
    const username = user?.username || user?.kode || "ADMIN";

    let actualNomor = nomor;

        if (isEdit) {
      // Kategori Proses sengaja TIDAK diubah lewat edit (lihat catatan FE:
      // dropdown di-disable saat edit) karena tahapan tspk_dtl sudah
      // ter-generate berdasarkan proses awal. Ganti proses di tengah jalan
      // butuh alur terpisah (regenerate tahapan), belum di-scope di sini.
      // ⬅️ BARU: spk_jumlah_jadi TIDAK ikut di-update lewat form edit —
      // satu-satunya jalur yang boleh menaikkan nilai itu adalah trigger
      // LHK saat laporan produksi selesai/final. Mengizinkan client mengirim
      // jumlah jadi bisa memalsukan status "Selesai" tanpa proses produksi.
      //
      // ⬅️ BARU (2026-10-13): spk_user_create TIDAK disentuh di sini —
      // pembuat SPK tidak berubah karena diedit. Yang ditulis cuma
      // spk_user_modified + spk_date_modified, sumbernya user yang lagi
      // login (dipakai kolom USER di browse SPK).
      await conn.query(
        `UPDATE tspk SET
            spk_nama = ?, spk_brg_kode = ?, spk_cus_kode = ?, spk_tanggal = ?, spk_dateline = ?,
            spk_jumlah = ?, spk_keterangan = ?, spk_idbatch = ?,
            spk_tanggal_produksi = ?, spk_shift = ?, spk_no_po = ?, spk_tanggal_po = ?,
            spk_date_modified = ?, spk_user_modified = ?
         WHERE spk_nomor = ?`,
        [
          nama, brgKode, custKode || null, tanggal, dateline || null,
          jumlah || 0, keterangan || "", idBatch || "",
          baru.tanggalProduksi, baru.shift, baru.noPo, baru.tanggalPo,
          new Date(), username,
          actualNomor,
        ]
      );

      // ⬅️ BARU (via audit): edit spk_jumlah harus ikut menyinkronkan
      // dtl_target di tspk_dtl. Sebelumnya generateDetailForSpk hanya
      // berjalan saat CREATE, jadi setelah jumlah diubah, target setiap
      // tahapan masih angka lama — guard sisa input LHK jadi meleset.
      // Aman karena edit diblokir begitu SPK punya LHK (hasLhkReport),
      // sehingga semua baris tspk_dtl masih = jumlah yang baru ini.
      await conn.query(
        `UPDATE tspk_dtl SET dtl_target = ? WHERE TRIM(dtl_spk_nomor) = TRIM(?)`,
        [jumlah || 0, actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      const prefix = `SPK.${yyyymm}.`;

      lockKey = `nomor_spk_${yyyymm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT spk_nomor FROM tspk WHERE spk_nomor LIKE ? ORDER BY spk_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.spk_nomor) {
        const parts = maxRow.spk_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      // ✅ FIX (bebas): nomor autogenerate WAJIB dijamin bebas di database
      // (sisa header dari save gagal — MyISAM tidak rollback — / entri manual).
      let actualFreeNomor = null;
      while (nextNum <= 999) {
        const kandidat = `${prefix}${String(nextNum).padStart(3, "0")}`;
        const [[ada]] = await conn.query(
          `SELECT spk_nomor FROM tspk WHERE spk_nomor = ?`,
          [kandidat]
        );
        if (!ada) { actualFreeNomor = kandidat; break; }
        nextNum++;
      }
      if (!actualFreeNomor) {
        throw new Error(`Kuota nomor SPK untuk periode ${yyyymm} sudah habis.`);
      }
      actualNomor = actualFreeNomor;

      // ⬅️ FIX: spk_jumlah_jadi WAJIB ikut di-INSERT sebagai 0. Sebelumnya
      // kolom ini tidak ada di daftar kolom sehingga jatuh ke DEFAULT NULL —
      // akibatnya trigger LHK `spk_jumlah_jadi + v_jumlah` menghasilkan NULL
      // selamanya, sehingga "Jadi" tampil 0 dan status mentok "Proses" walau
      // tahap finalisasi sudah selesai. Nilai dari client TETAP tidak dipakai
      // (status "Selesai" hanya dicapai lewat akumulasi LHK).
      //
      // Catatan: literal 0 kedua yang DULU ada di sini milik spk_jumlah_kirim
      // — kolom itu di-drop di migration 2026-10-08, jadi ikut dibuang.
      // Kalau hanya tersisa satu 0, itu milik spk_jumlah_jadi dan WAJIB ada.
      await conn.query(
        `INSERT INTO tspk (
            spk_nomor, spk_nama, spk_brg_kode, spk_prs_kode, spk_cus_kode, spk_tanggal, spk_dateline,
            spk_tanggal_produksi, spk_shift, spk_no_po, spk_tanggal_po,
            spk_jumlah, spk_jumlah_jadi, spk_keterangan, spk_idbatch,
            spk_date_create, spk_user_create
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          actualNomor, nama, brgKode, prsKode, custKode || null, tanggal, dateline || null,
          baru.tanggalProduksi, baru.shift, baru.noPo, baru.tanggalPo,
          jumlah || 0, keterangan || "", idBatch || "",
          new Date(), username,
        ]
      );

      await detailSvc.generateDetailForSpk(conn, actualNomor, prsKode, jumlah || 0);
    }

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    if (lockKey) await releaseLock(conn, lockKey);
    conn.release();
  }
};

// Sneak peek nomor otomatis — SPK.YYYYMM. + 3 digit (000-999), gap-fill
// identik dengan saveData.
const getNomorPreview = async (tanggal = new Date()) => {
  const d = tanggal instanceof Date ? tanggal : new Date(tanggal);
  if (isNaN(d.getTime())) throw new Error("Tanggal tidak valid.");
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `SPK.${yyyymm}.`;

  return cariNomorBebas(db, {
    tabel: "tspk",
    kolom: "spk_nomor",
    prefix,
    rangeEnd: 999,
    digit: 3,
    pesanKuota: `Kuota nomor SPK untuk periode ${yyyymm} sudah habis.`,
  });
};

module.exports = { getBarangOptions, getCustomerOptions, getDetailForm, saveData, getNomorPreview };