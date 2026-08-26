const db = require("../../config/database");

// ── Lookup account berdasarkan jenis (KAS/BANK) + cabang ─────────────
const getAccountOptions = async (jenis, cabang) => {
  let whereClause;
  if (jenis === "KAS") {
    whereClause = `LEFT(rek_kode,5)='A-111'`;
    if (cabang && cabang !== "P01")
      whereClause += ` AND rek_cabang = '${cabang}'`;
    else whereClause += ` AND rek_cabang = 'P01'`;
  } else {
    whereClause = `(LEFT(rek_kode,5)='A-112' OR LEFT(rek_kode,5)='B-211')`;
    if (cabang && cabang !== "P01")
      whereClause += ` AND rek_cabang = '${cabang}'`;
  }

  const [rows] = await db.query(
    `SELECT rek_kode AS kode, rek_nama AS nama, rek_cabang AS cabang
     FROM trekening WHERE ${whereClause} ORDER BY rek_kode`,
  );
  return rows;
};

// ── Lookup pengajuan yang belum dibuatkan bon ─────────────────────────
const getPengajuanOptions = async (cabang) => {
  let sql = `
    SELECT h.pmt_pjh_nomor AS nomor,
           DATE_FORMAT(j.pjh_tanggal,'%Y-%m-%d') AS tanggal,
           j.pjh_ke AS ke,
           j.pjh_user_kode AS user_kode,
           h.pmt_keterangan AS keterangan
    FROM ga2.tpermintaan_hdr h
    INNER JOIN ga2.tpengajuan2_hdr j ON j.pjh_nomor = h.pmt_pjh_nomor
    WHERE h.pmt_approval = 0 AND h.pmt_close = 0
  `;
  if (cabang && cabang !== "P01") sql += ` AND j.pjh_ke = '${cabang}'`;
  sql += ` ORDER BY h.pmt_pjh_nomor DESC`;

  const [rows] = await db.query(sql);
  return rows;
};

// ── Load data pengajuan ke form (edtNomorPengajuanExit) ───────────────
const getDetailPengajuan = async (pjhNomor) => {
  // Cek apakah sudah dibuatkan bon
  const [cekBon] = await db.query(
    `SELECT bon_nomor FROM tkasbon WHERE bon_pjh_nomor = ?`,
    [pjhNomor],
  );
  if (cekBon.length > 0)
    throw new Error(
      `Nomor pengajuan ini sudah dibuatkan bon dengan nomor: ${cekBon[0].bon_nomor}`,
    );

  const [rows] = await db.query(
    `
    SELECT
      h.pmt_nomor, h.pmt_pjh_nomor, h.pmt_keterangan, h.pmt_approval,
      DATE_FORMAT(h.pmt_tanggal,'%Y-%m-%d') AS pmt_tanggal,
      j.pjh_nik, j.pjh_jenis_permintaan,
      DATE_FORMAT(j.pjh_tanggal,'%Y-%m-%d') AS pjh_tanggal,
      p.nama, p.bagian, p.lokasi,
      d.pmd_nourut, d.pmd_nama, d.pmd_spesifikasi, d.pmd_qty_riil,
      d.pmd_satuan, d.pmd_nilai, d.pmd_dana_approved,
      d.pmd_tanggal_reject, d.pmd_tanggal_approved, d.pmd_kegunaan, d.pmd_bon
    FROM ga2.tpermintaan_hdr h
    INNER JOIN ga2.tpengajuan2_hdr j ON j.pjh_nomor = h.pmt_pjh_nomor
    INNER JOIN ga2.peminta p ON p.nik = j.pjh_nik
    INNER JOIN ga2.tpermintaan_dtl d ON d.pmd_pmt_nomor = h.pmt_nomor
    WHERE d.pmd_kode_reject <> 1 AND h.pmt_close = 0
      AND h.pmt_pjh_nomor = ?
    ORDER BY d.pmd_nourut
  `,
    [pjhNomor],
  );

  if (rows.length === 0)
    throw new Error("Nomor pengajuan tersebut tidak ada atau sudah close.");

  const h = rows[0];
  const detail = rows.map((r) => {
    const isApproval0 = h.pmt_approval == 0;
    const nilai = isApproval0 ? r.pmd_nilai : r.pmd_dana_approved;
    return {
      no: r.pmd_nourut,
      nama: r.pmd_nama,
      spesifikasi: r.pmd_spesifikasi,
      qty: r.pmd_qty_riil,
      satuan: r.pmd_satuan,
      nilai: nilai,
      nilai_old: nilai,
      total: r.pmd_qty_riil * nilai,
      approved: isApproval0 ? true : !r.pmd_tanggal_approved ? false : true,
      reject: isApproval0 ? false : !r.pmd_tanggal_reject ? false : true,
      kegunaan: r.pmd_kegunaan,
      ga: 1, // dari pengajuan GA
      kdsup: "",
      supplier: "",
      bank: "",
      rekening: "",
      atasnama: "",
    };
  });

  return {
    pmt_nomor: h.pmt_nomor,
    pmt_pjh_nomor: h.pmt_pjh_nomor,
    pmt_tanggal: h.pmt_tanggal,
    pjh_tanggal: h.pjh_tanggal,
    pjh_nik: h.pjh_nik,
    pjh_jenis_permintaan: h.pjh_jenis_permintaan,
    nama: h.nama,
    bagian: h.bagian,
    lokasi: h.lokasi,
    keterangan: h.pmt_keterangan,
    penerima: h.nama,
    detail,
  };
};

// ── Load data kasbon existing untuk edit ──────────────────────────────
const getDetailForm = async (nomor) => {
  const [rows] = await db.query(
    `
    SELECT
      k.bon_nomor, k.bon_cabang, k.bon_jenis, k.bon_nota,
      DATE_FORMAT(k.bon_tanggal,'%Y-%m-%d') AS bon_tanggal,
      k.bon_pjh_nomor, k.bon_nominal, k.bon_penerima,
      k.bon_keterangan, k.bon_selesai, k.bon_jur_no,
      k.bon_rek_kode, r.rek_nama,
      h.pmt_nomor, h.pmt_approval,
      DATE_FORMAT(h.pmt_tanggal,'%Y-%m-%d') AS pmt_tanggal,
      DATE_FORMAT(j.pjh_tanggal,'%Y-%m-%d') AS pjh_tanggal,
      j.pjh_nik, j.pjh_jenis_permintaan,
      p.nama, p.bagian, p.lokasi,
      h.pmt_keterangan,
      d.pmd_nourut, d.pmd_nama, d.pmd_spesifikasi,
      d.pmd_qty_riil, d.pmd_satuan,
      d.pmd_nilai, d.pmd_dana_approved,
      d.pmd_tanggal_reject, d.pmd_tanggal_approved,
      d.pmd_kegunaan, d.pmd_bon
    FROM tkasbon k
    LEFT JOIN ga2.tpermintaan_dtl d ON d.pmd_bon = k.bon_nomor
    LEFT JOIN ga2.tpermintaan_hdr h ON h.pmt_nomor = d.pmd_pmt_nomor
    LEFT JOIN ga2.tpengajuan2_hdr j ON j.pjh_nomor = h.pmt_pjh_nomor
    LEFT JOIN ga2.peminta p ON p.nik = j.pjh_nik
    LEFT JOIN trekening r ON r.rek_kode = k.bon_rek_kode
    WHERE k.bon_nomor = ?
    ORDER BY d.pmd_nourut
  `,
    [nomor],
  );

  if (rows.length === 0) throw new Error("Nomor kasbon tidak ditemukan.");

  const k = rows[0];

  // ── Validasi selesai (sama persis Delphi: bon_selesai <> 0 → tolak edit) ──
  if (k.bon_selesai !== 0 && k.bon_selesai !== "0")
    throw new Error(
      "Nomor kasbon ini sudah ada penyelesaian. Tidak bisa diubah.",
    );

  // ── Detail GA ──────────────────────────────────────────────────────
  const detailGA = rows
    .filter((r) => r.pmd_nama)
    .map((r) => {
      const isApproval0 = Number(k.pmt_approval) === 0;
      // Sama persis Delphi:
      // pmt_approval=0 → nilai=pmd_nilai, approved=true, reject=false
      // pmt_approval<>0 → nilai=pmd_dana_approved,
      //   approved = pmd_tanggal_approved IS NOT NULL
      //   reject   = pmd_tanggal_reject   IS NOT NULL
      const nilai = isApproval0
        ? Number(r.pmd_nilai)
        : Number(r.pmd_dana_approved);

      return {
        no: r.pmd_nourut,
        nama: r.pmd_nama,
        spesifikasi: r.pmd_spesifikasi || "",
        qty: Number(r.pmd_qty_riil),
        satuan: r.pmd_satuan || "",
        nilai,
        nilai_old: nilai,
        total: Number(r.pmd_qty_riil) * nilai,
        approved: isApproval0 ? true : !!r.pmd_tanggal_approved,
        reject: isApproval0 ? false : !!r.pmd_tanggal_reject,
        kegunaan: r.pmd_kegunaan || "",
        ga: 1,
        kdsup: "",
        supplier: "",
        bank: "",
        rekening: "",
        atasnama: "",
      };
    });

  // ── Detail non-GA dari tkasbonitem ────────────────────────────────
  const [itemRows] = await db.query(
    `
    SELECT
      bond_nourut, bond_nama, bond_spesifikasi, bond_satuan,
      bond_qty, bond_nominal,
      IFNULL(bond_sup_kode,'')   AS kdsup,
      IFNULL(bond_sup_nama,'')   AS supplier,
      IFNULL(bond_bank,'')       AS bank,
      IFNULL(bond_rekening,'')   AS rekening,
      IFNULL(bond_atasnama,'')   AS atasnama
    FROM tkasbonitem
    WHERE bond_nomor = ?
    ORDER BY bond_nourut
  `,
    [nomor],
  );

  // Delphi: non-GA selalu approved=true, reject=false
  const detailNonGA = itemRows.map((r) => ({
    no: r.bond_nourut,
    nama: r.bond_nama,
    spesifikasi: r.bond_spesifikasi || "",
    qty: Number(r.bond_qty),
    satuan: r.bond_satuan || "",
    nilai: Number(r.bond_nominal),
    nilai_old: Number(r.bond_nominal),
    total: Number(r.bond_qty) * Number(r.bond_nominal),
    approved: true, // ← Delphi: CDSGrid.fieldbyname('Approved').AsBoolean := true
    reject: false, // ← Delphi: CDSGrid.fieldbyname('Reject').AsBoolean := false
    kegunaan: "",
    ga: 0,
    kdsup: r.kdsup,
    supplier: r.supplier,
    bank: r.bank,
    rekening: r.rekening,
    atasnama: r.atasnama,
  }));

  // ── Delphi: setelah load GA, baru append non-GA di bawahnya ──────
  const detail = [...detailGA, ...detailNonGA];

  return {
    nomor: k.bon_nomor,
    tanggal: k.bon_tanggal,
    jenis: Number(k.bon_jenis) === 0 ? "KAS" : "BANK",
    rek_kode: k.bon_rek_kode,
    rek_nama: k.rek_nama,
    cabang: k.bon_cabang,
    cabang_old: k.bon_cabang,
    pjh_nomor: k.bon_pjh_nomor || "",
    nota: k.bon_nota || "",
    nominal: Number(k.bon_nominal),
    penerima: k.bon_penerima || "",
    keterangan: k.bon_keterangan || "",
    // ── Info permintaan ──
    pmt_nomor: k.pmt_nomor || "",
    pmt_tanggal: k.pmt_tanggal || "",
    pjh_tanggal: k.pjh_tanggal || "",
    pjh_nik: k.pjh_nik || "",
    jenis_permintaan: k.pjh_jenis_permintaan || "",
    nama: k.nama || "",
    bagian: k.bagian || "",
    lokasi: k.lokasi || "",
    detail,
  };
};

// ── Generate nomor otomatis ───────────────────────────────────────────
const getMaxNomor = async (cabang, conn) => {
  const prefix = `${cabang}-BON.${new Date().getFullYear()}.`;
  const [[row]] = await (conn || db).query(
    `SELECT IFNULL(MAX(CAST(RIGHT(bon_nomor,5) AS UNSIGNED)),0) AS max_val
     FROM tkasbon WHERE bon_nomor LIKE ?`,
    [`${prefix}%`],
  );
  return `${prefix}${String(Number(row.max_val) + 1).padStart(5, "0")}`;
};

// ── Simpan (insert/update) ────────────────────────────────────────────
const saveData = async (payload, user) => {
  const {
    isEdit,
    nomor,
    tanggal,
    jenis,
    rek_kode,
    cabang,
    pjh_nomor,
    nota,
    nominal,
    penerima,
    keterangan,
    pmt_nomor,
    detail,
    cabang_old,
  } = payload;

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    let actualNomor = nomor;
    let actualCabang = cabang;
    let flagEdit = isEdit;

    const jenisInt = jenis === "KAS" ? 0 : 1;

    // ── Delphi: jika edit dan cabang berubah → delete dulu, insert baru ──
    if (isEdit && cabang !== cabang_old) {
      await conn.query(`DELETE FROM tkasbon WHERE bon_nomor = ?`, [nomor]);
      flagEdit = false; // treat sebagai insert baru
    }

    if (flagEdit) {
      // ── UPDATE ──
      actualNomor = nomor;
      await conn.query(
        `
        UPDATE tkasbon SET
          bon_tanggal    = ?,
          bon_jenis      = ?,
          bon_pjh_nomor  = ?,
          bon_nota       = ?,
          bon_nominal    = ?,
          bon_penerima   = ?,
          bon_keterangan = ?,
          bon_cabang     = ?,
          bon_rek_kode   = ?,
          date_modified  = NOW(),
          user_modified  = ?
        WHERE bon_nomor = ?
      `,
        [
          tanggal,
          jenisInt,
          pjh_nomor || "",
          nota || "",
          nominal,
          penerima,
          keterangan || "",
          cabang,
          rek_kode,
          user.kode,
          nomor,
        ],
      );
    } else {
      // ── INSERT — generate nomor otomatis ──
      actualNomor = await getMaxNomor(actualCabang, conn);
      await conn.query(
        `
        INSERT INTO tkasbon
          (bon_nomor, bon_tanggal, bon_pjh_nomor, bon_jenis, bon_nota,
           bon_nominal, bon_penerima, bon_cabang, bon_rek_kode,
           bon_keterangan, date_create, user_create)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
      `,
        [
          actualNomor,
          tanggal,
          pjh_nomor || "",
          jenisInt,
          nota || "",
          nominal,
          penerima,
          actualCabang,
          rek_kode,
          keterangan || "",
          user.kode,
        ],
      );
    }

    // ── Delphi: selalu delete tkasbonitem dulu sebelum insert ulang ──
    // Pakai actualNomor (bisa nomor lama atau baru)
    await conn.query(`DELETE FROM tkasbonitem WHERE bond_nomor = ?`, [
      actualNomor,
    ]);

    // ── Hitung nourut awal untuk non-GA ──────────────────────────────
    // Delphi: ambil max pmd_nourut dari pengajuan lalu +1
    let nourut = 1;
    if (pjh_nomor) {
      const [[maxRow]] = await conn.query(
        `
        SELECT IFNULL(MAX(d.pmd_nourut), 0) AS max_val
        FROM ga2.tpermintaan_dtl d
        LEFT JOIN ga2.tpermintaan_hdr h ON h.pmt_nomor = d.pmd_pmt_nomor
        WHERE h.pmt_pjh_nomor = ?
      `,
        [pjh_nomor],
      );
      nourut = Number(maxRow.max_val) + 1;
    }

    // ── Loop detail ──────────────────────────────────────────────────
    let accCount = 0; // Delphi: acc counter untuk cek semua reject

    for (const d of detail) {
      // ── Non-GA yang Approved → insert tkasbonitem ─────────────────
      // Delphi: if Approved AND ga=0
      if (d.approved && d.ga === 0) {
        await conn.query(
          `
          INSERT INTO tkasbonitem
            (bond_nomor, bond_nourut, bond_nama, bond_spesifikasi,
             bond_satuan, bond_qty, bond_nominal, bond_verified,
             bond_sup_kode, bond_sup_nama, bond_bank,
             bond_rekening, bond_atasnama)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        `,
          [
            actualNomor,
            nourut,
            d.nama,
            d.spesifikasi || "",
            d.satuan || "",
            d.qty,
            d.nilai,
            d.kdsup || "",
            d.supplier || "",
            d.bank || "",
            d.rekening || "",
            d.atasnama || "",
          ],
        );
        nourut++;
      }

      // ── GA Approved → update tpermintaan_dtl approved ────────────
      // Delphi: if Approved AND ga=1
      if (d.approved && d.ga === 1) {
        accCount++;
        await conn.query(
          `
          UPDATE ga2.tpermintaan_dtl SET
            pmd_tanggal_approved = CURDATE(),
            pmd_user_approved    = ?,
            pmd_dana_approved    = ?,
            pmd_tanggal_reject   = NULL,
            pmd_kode_reject      = 0,
            pmd_user_reject      = '',
            pmd_bon              = ?
          WHERE pmd_pmt_nomor = ? AND pmd_nourut = ?
        `,
          [user.kode, d.nilai, actualNomor, pmt_nomor, d.no],
        );
      }

      // ── GA Reject → update tpermintaan_dtl reject ────────────────
      // Delphi: if Reject AND ga=1
      // NOTE: Delphi cek reject TERPISAH dari approved (bisa keduanya false)
      if (d.reject && d.ga === 1) {
        await conn.query(
          `
          UPDATE ga2.tpermintaan_dtl SET
            pmd_tanggal_reject   = CURDATE(),
            pmd_kode_reject      = 2,
            pmd_user_reject      = ?,
            pmd_tanggal_approved = NULL,
            pmd_user_approved    = '',
            pmd_dana_approved    = 0,
            pmd_bon              = ?
          WHERE pmd_pmt_nomor = ? AND pmd_nourut = ?
        `,
          [user.kode, actualNomor, pmt_nomor, d.no],
        );
      }
    }

    // ── Update pmt_approval + pmt_close jika ada pengajuan ──────────
    // Delphi: if edtnomorpengajuan.Text <> ''
    if (pjh_nomor && pmt_nomor) {
      await conn.query(
        `UPDATE ga2.tpermintaan_hdr SET pmt_approval = 1 WHERE pmt_nomor = ?`,
        [pmt_nomor],
      );

      // Delphi: if acc=0 → semua reject → close permintaan
      if (accCount === 0) {
        await conn.query(
          `UPDATE ga2.tpermintaan_hdr SET pmt_close = 1 WHERE pmt_nomor = ?`,
          [pmt_nomor],
        );
        await conn.query(
          `
          UPDATE ga2.tpermintaan_dtl SET
            pmd_tanggal_closed = CURDATE(),
            pmd_user_closed    = ?
          WHERE pmd_pmt_nomor = ?
        `,
          [user.kode, pmt_nomor],
        );
      }
    }

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Lookup supplier ───────────────────────────────────────────────────
const getSupplierOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT sup_kode AS kode, sup_nama AS nama,
            supd_bank AS bank, supd_rekening AS rekening, supd_atasnama AS atasnama
     FROM kencanaprint.tsupplier
     LEFT JOIN kencanaprint.tsupplieritem ON supd_kode = sup_kode
     WHERE sup_aktif = 'Y' AND (sup_nama LIKE ? OR sup_kode LIKE ?)
     ORDER BY sup_nama LIMIT 50`,
    [`%${search}%`, `%${search}%`],
  );
  return rows;
};

const getPrintData = async (nomor) => {
  const [[bon]] = await db.query(
    `
    SELECT
      b.bon_nomor AS nomor, b.bon_pjh_nomor AS pjh, b.bon_nota AS nota,
      DATE_FORMAT(b.bon_tanggal,'%Y-%m-%d') AS tanggal,
      DATE_FORMAT(b.bon_tanggal,'%d %b %Y') AS tanggal_fmt,
      b.bon_keterangan AS keterangan, b.bon_penerima AS penerima,
      b.bon_nominal AS gtotal, b.bon_cabang AS cabang,
      u.user_nama AS kasir
    FROM tkasbon b
    LEFT JOIN tuser u ON u.user_kode = b.user_create
    WHERE b.bon_nomor = ?
  `,
    [nomor],
  );

  if (!bon) throw new Error("Data tidak ditemukan.");

  // Detail dari GA (tpermintaan_dtl)
  const [detailGA] = await db.query(
    `
    SELECT
      d.pmd_nama AS nama, d.pmd_spesifikasi AS spesifikasi,
      d.pmd_satuan AS satuan, d.pmd_qty_riil AS qty,
      d.pmd_kegunaan AS kegunaan,
      IFNULL(d.pmd_dana_approved, d.pmd_nilai) AS nilai
    FROM ga2.tpermintaan_dtl d
    INNER JOIN ga2.tpermintaan_hdr h ON h.pmt_nomor = d.pmd_pmt_nomor
    WHERE d.pmd_bon = ? AND d.pmd_tanggal_approved IS NOT NULL
    ORDER BY d.pmd_nourut
  `,
    [nomor],
  );

  // Detail non-GA (tkasbonitem)
  const [detailNonGA] = await db.query(
    `
    SELECT
      bond_nama AS nama, bond_spesifikasi AS spesifikasi,
      bond_satuan AS satuan, bond_qty AS qty,
      '' AS kegunaan, bond_nominal AS nilai
    FROM tkasbonitem WHERE bond_nomor = ? ORDER BY bond_nourut
  `,
    [nomor],
  );

  const detail = [...detailGA, ...detailNonGA]
    .filter((d) => d.nama)
    .map((d) => ({ ...d, total: d.qty * d.nilai }));

  return { ...bon, detail };
};

module.exports = {
  getAccountOptions,
  getPengajuanOptions,
  getDetailPengajuan,
  getDetailForm,
  saveData,
  getSupplierOptions,
  getPrintData,
};
