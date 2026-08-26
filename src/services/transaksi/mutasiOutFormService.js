const db = require("../../config/database");

// ── Tutup Buku (MANKSI) — lokal, tidak pakai Finance cekTutupPeriode ──
const getZdtCloseMso = async () => {
  try {
    const [rows] = await db.query(
      `SELECT tgl_close FROM kencanaprint.tversi WHERE aplikasi = "MANKSI" LIMIT 1`,
    );
    let ztglclose = 0;
    if (rows.length > 0) ztglclose = parseInt(rows[0].tgl_close, 10);

    const today = new Date();
    let zDay = today.getDate();
    let zMonth = today.getMonth() + 1;
    let zYear = today.getFullYear();

    if (zDay <= ztglclose) {
      if (zMonth === 1) {
        zMonth = 12;
        zYear = zYear - 1;
      } else {
        zMonth = zMonth - 1;
      }
    }
    return new Date(zYear, zMonth - 1, ztglclose);
  } catch {
    return new Date(2000, 0, 1);
  }
};

// ── Generate Nomor ────────────────────────────────────────────────────
const generateNomor = async (tanggal, jenis) => {
  const d = new Date(tanggal);
  const tahun = d.getFullYear();

  let prefix = "MSOK";
  if (jenis === "ACCESORIES") prefix = "MSOA";
  else if (jenis === "OBAT") prefix = "MSOO";
  else if (jenis === "SPAREPART") prefix = "MSOS";

  const prefixTahun = `${prefix}${tahun}`;

  const [[row]] = await db.query(
    `SELECT IFNULL(MAX(CAST(RIGHT(mso_nomor, 5) AS UNSIGNED)), 0) AS max_val
     FROM kencanaprint.tgarmenmso_hdr
     WHERE LEFT(mso_nomor, 8) = ?`,
    [prefixTahun],
  );

  const nextNum = parseInt(row.max_val, 10) + 1;
  return `${prefixTahun}${String(nextNum).padStart(5, "0")}`;
};

// ── Stok Real ─────────────────────────────────────────────────────────
const getStokReal = async (
  conn,
  kodeBahan,
  jenis,
  bagian,
  cabang,
  nomorSaatIni,
) => {
  let stokQuery = "";
  if (bagian === "FINANCE") {
    stokQuery = `SELECT IFNULL(SUM(mst_stok_in - mst_stok_out), 0) AS stk
                 FROM finance.tmasterstok_finance
                 WHERE mst_aktif="Y" AND mst_brg_kode=? AND mst_cab=?`;
  } else {
    const tbl =
      jenis === "ACCESORIES"
        ? "tmasterstok_acc"
        : jenis === "OBAT"
          ? "tmasterstok_obat"
          : jenis === "SPAREPART"
            ? "tmasterstok_sparepart"
            : "tmasterstok_atk";
    stokQuery = `SELECT IFNULL(SUM(mst_stok_in - mst_stok_out), 0) AS stk
                 FROM kencanaprint.${tbl}
                 WHERE mst_aktif="Y" AND mst_brg_kode=? AND mst_cab=?`;
  }

  const [[rowStok]] = await conn.query(stokQuery, [kodeBahan, cabang]);
  const stok = Number(rowStok?.stk || 0);

  if (bagian === "FINANCE") {
    const [[rowMso]] = await conn.query(
      `SELECT IFNULL(SUM(d.msod_jumlah), 0) AS jml
       FROM kencanaprint.tgarmenmso_hdr h
       INNER JOIN kencanaprint.tgarmenmso_dtl d ON d.msod_nomor = h.mso_nomor
       WHERE h.mso_msi_nomor = "" AND h.mso_nomor <> ? AND d.msod_brg_kode = ?`,
      [nomorSaatIni || "", kodeBahan],
    );
    const msoSisa = Number(rowMso?.jml || 0);
    return { stok, msoSisa, real: stok - msoSisa };
  }

  return { stok, msoSisa: 0, real: 0 };
};

// ── Get Detail (Load Form Edit) ───────────────────────────────────────
const getDetail = async (nomor) => {
  const [rowsHdr] = await db.query(
    `SELECT
       mso_nomor AS Nomor,
       mso_jenis AS Jenis,
       DATE_FORMAT(mso_tanggal, "%Y-%m-%d") AS Tanggal,
       mso_cab AS CabangAsal,
       mso_kecab AS CabangTujuan,
       mso_bagian AS Bagian,
       mso_ket AS Keterangan,
       mso_msi_nomor AS NoTerima,
       user_create AS Usr,
       IFNULL((
         SELECT IFNULL(
           IF(pin_acc="" AND pin_dipakai="", "WAIT",
             IF(pin_acc="Y" AND pin_dipakai="", "ACC",
               IF(pin_acc="Y" AND pin_dipakai="Y", "",
                 IF(pin_acc="N", "TOLAK", "")
               )
             )
           ), ""
         )
         FROM kencanaprint.tspk_pin5
         WHERE pin_trs="MUTASI OUT" AND pin_nomor=mso_nomor
         ORDER BY pin_urut DESC LIMIT 1
       ), "") AS StatusEdit
     FROM kencanaprint.tgarmenmso_hdr
     WHERE mso_nomor = ?`,
    [nomor],
  );

  if (rowsHdr.length === 0) return null;
  const data = { ...rowsHdr[0], Detail: [] };

  const [rowsDtl] = await db.query(
    `SELECT
       d.msod_mb_nomor AS NoPermintaan,
       d.msod_brg_kode AS Kode,
       IF(b.brg_note="", b.brg_nama, CONCAT(b.brg_nama, " - ", b.brg_note)) AS Nama,
       b.brg_satuan AS Satuan,
       d.msod_ket AS Spesifikasi,
       d.msod_jumlah AS Jumlah
     FROM kencanaprint.tgarmenmso_dtl d
     LEFT JOIN kencanaprint.tgarmen_brg b ON b.brg_kode = d.msod_brg_kode
     WHERE d.msod_nomor = ?
     ORDER BY d.msod_urut ASC`,
    [nomor],
  );

  const conn = await db.getConnection();
  try {
    for (const dtl of rowsDtl) {
      const stokInfo = await getStokReal(
        conn,
        dtl.Kode,
        data.Jenis,
        data.Bagian,
        data.CabangAsal,
        data.Nomor,
      );
      data.Detail.push({ ...dtl, ...stokInfo });
    }
  } finally {
    conn.release();
  }

  const zdtClose = await getZdtCloseMso();
  data.isTutupBuku = zdtClose && new Date(data.Tanggal) < zdtClose;

  return data;
};

// ── Search Barang ─────────────────────────────────────────────────────
const searchBarang = async (query) => {
  const { jenis, bagian, cabang, search } = query;

  const tblStok =
    bagian === "FINANCE"
      ? "finance.tmasterstok_finance"
      : jenis === "ACCESORIES"
        ? "kencanaprint.tmasterstok_acc"
        : jenis === "OBAT"
          ? "kencanaprint.tmasterstok_obat"
          : jenis === "SPAREPART"
            ? "kencanaprint.tmasterstok_sparepart"
            : "kencanaprint.tmasterstok_atk";

  let sql = `
    SELECT
      b.brg_kode AS Kode,
      IF(b.brg_note="", b.brg_nama, CONCAT(b.brg_nama, " - ", b.brg_note)) AS Nama,
      b.brg_satuan AS Satuan,
      IFNULL((
        SELECT SUM(m.mst_stok_in - m.mst_stok_out)
        FROM ${tblStok} m
        WHERE m.mst_aktif="Y" AND m.mst_cab=? AND m.mst_brg_kode=b.brg_kode
      ), 0) AS Stok
    FROM kencanaprint.tgarmen_brg b
    WHERE b.brg_aktif="Y" AND b.brg_jenis = ?
  `;
  const params = [cabang, jenis];

  if (bagian === "TEKNISI") sql += ` AND b.brg_ktg <> "IT"`;
  else if (bagian === "IT") sql += ` AND b.brg_ktg = "IT"`;

  if (search) {
    sql += ` AND (b.brg_nama LIKE ? OR b.brg_kode LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY b.brg_nama LIMIT 100`;

  const [rows] = await db.query(sql, params);
  return rows;
};

// ── Save ──────────────────────────────────────────────────────────────
const save = async (data, userKode, userBagian, isNewMode) => {
  const zdtClose = await getZdtCloseMso();
  if (zdtClose && new Date(data.Tanggal) < zdtClose) {
    throw new Error("Tidak boleh input/edit di periode yang sudah diclose.");
  }

  if (!isNewMode && data.NoTerima && data.NoTerima.trim() !== "") {
    throw new Error("Mutasi tersebut sudah diterima. Tidak bisa diubah.");
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let nomorMutasi = data.Nomor;

    if (isNewMode) {
      nomorMutasi = await generateNomor(data.Tanggal, data.Jenis);
      await conn.query(
        `INSERT INTO kencanaprint.tgarmenmso_hdr
           (mso_jenis, mso_nomor, mso_tanggal, mso_cab, mso_kecab, mso_bagian, mso_ket, date_create, user_create)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          data.Jenis,
          nomorMutasi,
          data.Tanggal,
          data.CabangAsal,
          data.CabangTujuan,
          data.Bagian || userBagian,
          data.Keterangan || "",
          userKode,
        ],
      );
    } else {
      await conn.query(
        `UPDATE kencanaprint.tgarmenmso_hdr SET
           mso_tanggal=?, mso_kecab=?, mso_ket=?, date_modified=NOW(), user_modified=?
         WHERE mso_nomor=?`,
        [
          data.Tanggal,
          data.CabangTujuan,
          data.Keterangan || "",
          userKode,
          nomorMutasi,
        ],
      );

      await conn.query(
        `DELETE FROM kencanaprint.tgarmenmso_dtl WHERE msod_nomor=?`,
        [nomorMutasi],
      );

      // Tandai PIN ACC sudah dipakai
      if (data.StatusEdit === "ACC") {
        const [lastPin] = await conn.query(
          `SELECT pin_urut FROM kencanaprint.tspk_pin5
           WHERE pin_trs="MUTASI OUT" AND pin_nomor=?
           ORDER BY pin_urut DESC LIMIT 1`,
          [nomorMutasi],
        );
        if (lastPin.length > 0) {
          await conn.query(
            `UPDATE kencanaprint.tspk_pin5 SET pin_dipakai="Y"
             WHERE pin_trs="MUTASI OUT" AND pin_nomor=? AND pin_urut=?`,
            [nomorMutasi, lastPin[0].pin_urut],
          );
        }
      }
    }

    // Insert detail
    const validDetails = (data.Detail || []).filter(
      (d) => d.Kode && Number(d.Jumlah) > 0,
    );
    if (validDetails.length === 0) {
      throw new Error("Detail barang harus diisi (jumlah harus > 0).");
    }

    const values = validDetails.map((d, i) => [
      nomorMutasi,
      d.NoPermintaan || "",
      d.Kode,
      Number(d.Jumlah),
      d.Spesifikasi || "",
      i + 1,
    ]);

    await conn.query(
      `INSERT INTO kencanaprint.tgarmenmso_dtl
         (msod_nomor, msod_mb_nomor, msod_brg_kode, msod_jumlah, msod_ket, msod_urut)
       VALUES ?`,
      [values],
    );

    await conn.commit();
    return nomorMutasi;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

// ── Search No. Permintaan (khusus FINANCE) ────────────────────────────
const searchPermintaanFinance = async (jenis, cabangTujuan, search) => {
  let sql = `
    SELECT
      h.mb_jenis AS Jenis,
      h.mb_nomor AS NoPermintaan,
      DATE_FORMAT(h.mb_tanggal, '%Y-%m-%d') AS Tanggal,
      h.mb_ket AS Keterangan,
      h.mb_cab AS Cab,
      h.user_create AS Peminta
    FROM kencanaprint.tgarmenmintabeli_hdr h
    WHERE h.mb_nomor IN (
      SELECT DISTINCT c.bond2_link FROM finance.tkasbonitem2 c
      WHERE LEFT(c.bond2_link, 2) = "MB"
    )
    AND h.mb_jenis = ?
    AND h.mb_cab = ?
  `;
  const params = [jenis, cabangTujuan];

  if (search) {
    sql += ` AND (h.mb_nomor LIKE ? OR h.mb_ket LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY h.mb_tanggal DESC LIMIT 50`;
  const [rows] = await db.query(sql, params);
  return rows;
};

// ── Get Detail dari No. Permintaan (khusus FINANCE) ───────────────────
const getDetailPermintaanFinance = async (
  noPermintaan,
  cabangAsal,
  nomorMso,
) => {
  const [rows] = await db.query(
    `SELECT
       k.bond2_link AS NoPermintaan,
       k.bond2_brg_kode AS Kode,
       IF(b.brg_note="", b.brg_nama, CONCAT(b.brg_nama, " - ", b.brg_note)) AS Nama,
       b.brg_satuan AS Satuan,
       k.bond2_spesifikasi AS Spesifikasi,
       IFNULL((
         SELECT SUM(m.mst_stok_in - m.mst_stok_out)
         FROM finance.tmasterstok_finance m
         WHERE m.mst_aktif="Y" AND m.mst_cab=? AND m.mst_brg_kode=k.bond2_brg_kode
       ), 0) AS Stok,
       IFNULL((
         SELECT SUM(d.msod_jumlah)
         FROM kencanaprint.tgarmenmso_hdr h
         INNER JOIN kencanaprint.tgarmenmso_dtl d ON d.msod_nomor = h.mso_nomor
         WHERE h.mso_msi_nomor="" AND h.mso_nomor <> ? AND d.msod_brg_kode=k.bond2_brg_kode
       ), 0) AS Belum
     FROM finance.tkasbonitem2 k
     LEFT JOIN kencanaprint.tgarmen_brg b ON b.brg_kode = k.bond2_brg_kode
     WHERE k.bond2_link = ?`,
    [cabangAsal, nomorMso || "", noPermintaan],
  );

  return rows.map((r) => ({
    NoPermintaan: r.NoPermintaan,
    Kode: r.Kode,
    Nama: r.Nama,
    Satuan: r.Satuan,
    Spesifikasi: r.Spesifikasi,
    Stok: Number(r.Stok),
    StokBelumDiterima: Number(r.Belum),
    StokReal: Number(r.Stok) - Number(r.Belum),
    Jumlah: Number(r.Stok) - Number(r.Belum),
  }));
};

module.exports = {
  getDetail,
  searchBarang,
  save,
  searchPermintaanFinance,
  getDetailPermintaanFinance,
};
