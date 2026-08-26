const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");

// --- 1. GET BROWSE HEADER ---
const getBrowse = async (query, user) => {
  const { startDate, endDate, cabang, jenis } = query;

  const dStart =
    startDate ||
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .substring(0, 10);
  const dEnd = endDate || new Date().toISOString().substring(0, 10);

  let sql = `
    SELECT 
      h.mso_nomor AS Nomor,
      h.mso_jenis AS Jenis,
      DATE_FORMAT(h.mso_tanggal, "%Y-%m-%d") AS Tanggal,
      h.mso_cab AS Cab,
      h.mso_kecab AS Tujuan,
      h.mso_ket AS Keterangan,
      h.user_create AS Usr,
      h.mso_bagian AS Bagian,
      DATE_FORMAT(h.date_create, "%Y-%m-%d %H:%i:%s") AS Created,
      h.mso_msi_nomor AS NoTerima,
      h.mso_msi_usr AS UsrTerima,
      DATE_FORMAT(h.mso_msi_date, "%Y-%m-%d %H:%i:%s") AS TglTerima,

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
        WHERE pin_trs="MUTASI OUT" AND pin_nomor=h.mso_nomor
        ORDER BY pin_urut DESC LIMIT 1
      ), "") AS Ngedit

    FROM kencanaprint.tgarmenmso_hdr h
    WHERE h.mso_tanggal >= ? AND h.mso_tanggal <= ?
  `;

  const params = [dStart, dEnd];

  if (jenis) {
    sql += ` AND h.mso_jenis = ?`;
    params.push(jenis);
  }

  if (user && user.bagian && user.bagian !== "EDP" && user.bagian !== "AUDIT") {
    sql += ` AND h.mso_bagian = ?`;
    params.push(user.bagian);
  }

  if (cabang && cabang !== "ALL") {
    sql += ` AND h.mso_cab = ?`;
    params.push(cabang);
  }

  sql += ` ORDER BY h.mso_nomor DESC`;

  const [rows] = await db.query(sql, params);
  return rows;
};

// --- 2. GET BROWSE DETAIL ---
const getBrowseDetail = async (nomorMutasi) => {
  const sql = `
    SELECT 
      d.msod_nomor AS Nomor,
      d.msod_mb_nomor AS NoPermintaan,
      d.msod_brg_kode AS Kode,
      IF(b.brg_note="", b.brg_nama, CONCAT(b.brg_nama, " - ", b.brg_note)) AS Nama,
      d.msod_ket AS Spesifikasi,
      b.brg_satuan AS Satuan,
      d.msod_jumlah AS Jumlah
    FROM kencanaprint.tgarmenmso_dtl d
    LEFT JOIN kencanaprint.tgarmen_brg b ON d.msod_brg_kode = b.brg_kode
    WHERE d.msod_nomor = ?
    ORDER BY d.msod_urut ASC
  `;

  const [rows] = await db.query(sql, [nomorMutasi]);
  return rows;
};

const getZdtCloseMso = async () => {
  try {
    const [rows] = await db.query(
      `SELECT tgl_close FROM kencanaprint.tversi WHERE aplikasi = "MANKSI" LIMIT 1`,
    );

    let ztglclose = 0;
    if (rows.length > 0) {
      ztglclose = parseInt(rows[0].tgl_close, 10);
    }

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
  } catch (error) {
    console.error("Gagal menghitung zdtClose MSO:", error);
    return new Date(2000, 0, 1);
  }
};

// --- 3. DELETE DATA ---
const deleteData = async (nomor) => {
  const conn = await db.getConnection();
  try {
    const [headers] = await conn.query(
      `SELECT mso_tanggal, mso_msi_nomor FROM kencanaprint.tgarmenmso_hdr WHERE mso_nomor = ?`,
      [nomor],
    );

    if (headers.length === 0) throw new Error("Data tidak ditemukan.");
    const header = headers[0];

    if (header.mso_msi_nomor && header.mso_msi_nomor.trim() !== "") {
      throw new Error(
        "Mutasi tsb sudah diterima di cabang tujuan. Tidak bisa dihapus.",
      );
    }

    const zdtClose = await getZdtCloseMso();
    if (new Date(header.mso_tanggal) < zdtClose) {
      throw new Error(
        "Transaksi tersebut sudah close (Tutup Buku). Tidak bisa dihapus.",
      );
    }

    await conn.query(
      `DELETE FROM kencanaprint.tgarmenmso_hdr WHERE mso_nomor = ?`,
      [nomor],
    );

    return true;
  } finally {
    conn.release();
  }
};

// --- 4. PENGAJUAN PIN PERUBAHAN DATA ---
const requestPinEdit = async (payload, userKode) => {
  const { nomor, tanggal, keterangan, alasan } = payload;
  const conn = await db.getConnection();
  try {
    const [lastPin] = await conn.query(
      `SELECT pin_urut, pin_dipakai FROM kencanaprint.tspk_pin5 WHERE pin_trs="MUTASI OUT" AND pin_nomor=? ORDER BY pin_urut DESC LIMIT 1`,
      [nomor],
    );

    let urut = 1;
    if (lastPin.length > 0) {
      if (lastPin[0].pin_dipakai === "") {
        throw new Error(
          "Pengajuan sebelumnya masih pending (Belum digunakan/Di-ACC).",
        );
      } else {
        urut = lastPin[0].pin_urut + 1;
      }
    }

    await conn.query(
      `
      INSERT INTO kencanaprint.tspk_pin5 (pin_trs, pin_nomor, pin_urut, pin_tgl_trs, pin_ket, pin_tgl_minta, pin_user_minta, pin_alasan)
      VALUES ("MUTASI OUT", ?, ?, ?, ?, NOW(), ?, ?)
      ON DUPLICATE KEY UPDATE
        pin_tgl_trs=VALUES(pin_tgl_trs),
        pin_ket=VALUES(pin_ket),
        pin_acc="",
        pin_tgl_minta=NOW(),
        pin_user_minta=VALUES(pin_user_minta),
        pin_alasan=VALUES(pin_alasan)
    `,
      [nomor, urut, tanggal, keterangan || "", userKode, alasan],
    );

    return true;
  } finally {
    conn.release();
  }
};

module.exports = {
  getBrowse,
  getBrowseDetail,
  deleteData,
  requestPinEdit,
};
