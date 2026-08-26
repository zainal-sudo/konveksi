const db = require("../../config/database");

// ── Browse ────────────────────────────────────────────────────────────
// Delphi: filter tanggal = startdate (single date, bukan range)
// SaldoAkhir = SUM(jurd_debet - jurd_kredit) WHERE jur_tanggal <= tanggal
// dan jurd_nourut = 0 (header item saja)
const getBrowse = async (tanggal) => {
  const [rows] = await db.query(
    `
    SELECT
      r.rek_kode  AS Kode,
      r.rek_nama  AS Nama,
      IFNULL((
        SELECT SUM(i.jurd_debet - i.jurd_kredit)
        FROM tjurnalitem i
        LEFT JOIN tjurnal j ON j.jur_no = i.jurd_jur_no
        WHERE j.jur_tanggal <= ?
          AND i.jurd_nourut = 0
          AND i.jurd_rek_kode = r.rek_kode
      ), 0) AS SaldoAkhir,
      IFNULL(v.rkv_koran, 0) AS SaldoBank,
      IF(IFNULL(v.rkv_rekon, 0) = 0, 'Belum', 'Sudah') AS Rekon
    FROM trekening r
    LEFT JOIN trekon_valid v
      ON v.rkv_rek_kode = r.rek_kode
      AND v.rkv_tanggal = ?
    WHERE r.rek_isaktif = 0
      AND (LEFT(r.rek_kode,5) = 'A-112' OR LEFT(r.rek_kode,5) = 'B-211')
    ORDER BY r.rek_kode
  `,
    [tanggal, tanggal],
  );
  return rows;
};

// ── Hapus ─────────────────────────────────────────────────────────────
// Delphi: delete from trekon_valid where rkv_rek_kode=? and rkv_tanggal=?
const deleteData = async (rekKode, tanggal) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(
      `DELETE FROM trekon_valid
       WHERE rkv_rek_kode = ? AND rkv_tanggal = ?`,
      [rekKode, tanggal],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Validasi Bank: get existing saldo koran ───────────────────────────
const getValidasi = async (rekKode, tanggal) => {
  const [[row]] = await db.query(
    `
    SELECT IFNULL(rkv_koran, 0) AS saldo_koran
    FROM trekon_valid
    WHERE rkv_rek_kode = ? AND rkv_tanggal = ?
  `,
    [rekKode, tanggal],
  );
  return row ?? { saldo_koran: 0 };
};

// ── Validasi Bank: upsert trekon_valid ────────────────────────────────
// Delphi simpandata: SELECT dulu, jika ada → UPDATE, jika tidak → INSERT
const saveValidasi = async (rekKode, tanggal, saldoKoran, user) => {
  const [[existing]] = await db.query(
    `
    SELECT rkv_rek_kode FROM trekon_valid
    WHERE rkv_rek_kode = ? AND rkv_tanggal = ?
  `,
    [rekKode, tanggal],
  );

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    if (existing) {
      await conn.query(
        `
        UPDATE trekon_valid SET
          rkv_koran     = ?,
          date_modified = NOW(),
          user_modified = ?
        WHERE rkv_rek_kode = ? AND rkv_tanggal = ?
      `,
        [saldoKoran, user.kode, rekKode, tanggal],
      );
    } else {
      await conn.query(
        `
        INSERT INTO trekon_valid
          (rkv_rek_kode, rkv_tanggal, rkv_koran, date_create, user_create)
        VALUES (?, ?, ?, NOW(), ?)
      `,
        [rekKode, tanggal, saldoKoran, user.kode],
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Load data rekonsiliasi existing ───────────────────────────────────
const getRekon = async (rekKode, tanggal) => {
  const loadDet = async (tabel) => {
    const [rows] = await db.query(
      `SELECT rk_nama AS nama, rk_ket AS ket, rk_nominal AS nominal
       FROM ${tabel} WHERE rk_rek_kode = ? AND rk_tanggal = ?
       ORDER BY rk_id`,
      [rekKode, tanggal],
    );
    return rows.map((r, i) => ({
      no: i + 1,
      uraian: r.nama || "",
      keterangan: r.ket || "",
      nominal: Number(r.nominal) || 0,
    }));
  };

  const [bukuTambah, bukuKurang, bankTambah, bankKurang] = await Promise.all([
    loadDet("trekon_det"),
    loadDet("trekon_det2"),
    loadDet("trekon_det3"),
    loadDet("trekon_det4"),
  ]);

  return { bukuTambah, bukuKurang, bankTambah, bankKurang };
};

// ── Simpan rekonsiliasi ───────────────────────────────────────────────
const saveRekon = async (
  rekKode,
  tanggal,
  saldoBuku,
  saldoKoran,
  detail,
  user,
) => {
  const { bukuTambah, bukuKurang, bankTambah, bankKurang } = detail;

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // Delphi simpandata: upsert trekon_valid + rkv_rekon=1
    const [[existing]] = await conn.query(
      `SELECT rkv_rek_kode FROM trekon_valid
       WHERE rkv_rek_kode = ? AND rkv_tanggal = ?`,
      [rekKode, tanggal],
    );

    if (existing) {
      await conn.query(
        `
        UPDATE trekon_valid SET
          rkv_saldo     = ?,
          rkv_koran     = ?,
          rkv_rekon     = 1,
          date_modified = NOW(),
          user_modified = ?
        WHERE rkv_rek_kode = ? AND rkv_tanggal = ?
      `,
        [saldoBuku, saldoKoran, user.kode, rekKode, tanggal],
      );
    } else {
      await conn.query(
        `
        INSERT INTO trekon_valid
          (rkv_rek_kode, rkv_tanggal, rkv_saldo, rkv_koran,
           rkv_rekon, date_create, user_create)
        VALUES (?, ?, ?, ?, 1, NOW(), ?)
      `,
        [rekKode, tanggal, saldoBuku, saldoKoran, user.kode],
      );
    }

    // Helper insert detail ke masing-masing tabel
    const saveDet = async (tabel, rows) => {
      await conn.query(
        `DELETE FROM ${tabel} WHERE rk_rek_kode = ? AND rk_tanggal = ?`,
        [rekKode, tanggal],
      );
      for (const r of rows) {
        if (!r.uraian) continue;
        await conn.query(
          `INSERT INTO ${tabel} (rk_rek_kode, rk_tanggal, rk_nama, rk_ket, rk_nominal)
           VALUES (?, ?, ?, ?, ?)`,
          [
            rekKode,
            tanggal,
            r.uraian,
            r.keterangan || "",
            Number(r.nominal) || 0,
          ],
        );
      }
    };

    await saveDet("trekon_det", bukuTambah);
    await saveDet("trekon_det2", bukuKurang);
    await saveDet("trekon_det3", bankTambah);
    await saveDet("trekon_det4", bankKurang);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = {
  getBrowse,
  deleteData,
  getValidasi,
  saveValidasi,
  getRekon,
  saveRekon,
};
