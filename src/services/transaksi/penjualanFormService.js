const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");
const { createAutoJurnalPenjualan } = require("../../utils/jurnalPenjualan");
const { getHppBarang } = require("../../utils/jurnalMutasiCabang");

// ── Gudang penjualan sesuai cabang login ────────────────────────────────
// Utama: gudang produk jadi milik cabang (GJ-01 pusat, GJ-02 AA, GJ-03 CC);
// fallback gudang pertama milik cabang tsb.
const getGudangPenjualan = async (conn, cabangKode) => {
  const [[g]] = await conn.query(
    `SELECT gdg_kode FROM tgudang
      WHERE gdg_cbg_kode = ?
      ORDER BY (gdg_nama LIKE '%Jadi%') DESC, gdg_kode
      LIMIT 1`,
    [String(cabangKode || "00")]
  );
  return g?.gdg_kode || null;
};

// ── Kartu stok: pengurangan stok penjualan langsung di gudang cabang ────
// Diboldkarkan dulu per nomor SO supaya idempotent (aman untuk edit/save ulang).
const simpanKartuStokPenjualan = async (conn, { nomor, gudang, tanggal, detail, user }) => {
  await conn.query(`DELETE FROM tmasterstok WHERE mst_noreferensi = ?`, [nomor]);
  if (!gudang) throw new Error("Gudang penjualan untuk cabang ini tidak ditemukan.");

  // Aggregate permintaan — cek kecukupan stok sementara DILEPAS
  // (penjualan boleh jalan meski stok 0/kurang; HPP ambil avgcost
  //  gudang, fallback harga beli). Aktifkan kembali bila stok sudah bersih.
  const permintaan = new Map();
  for (const item of detail) {
    const qty = Number(item.qty) || 0;
    if (qty <= 0) continue;
    permintaan.set(item.brgKode, (permintaan.get(item.brgKode) || 0) + qty);
  }

  for (const item of detail) {
    const qty = Number(item.qty) || 0;
    if (qty <= 0) continue;
    const hpp = await getHppBarang(conn, item.brgKode, gudang);
    await conn.query(
      `INSERT INTO tmasterstok
         (mst_brg_kode, mst_gdg_kode, mst_stok_in, mst_stok_out,
          mst_expired_date, mst_hargabeli, mst_noreferensi, mst_tanggal, mst_avgcost)
       VALUES (?, ?, 0, ?, '0000-00-00', ?, ?, ?, ?)`,
      [item.brgKode, gudang, qty, hpp, nomor, tanggal, hpp]
    );
  }

  // ── Baris retur (qty minus): barang masuk kembali ke gudang cabang ──
  for (const item of detail) {
    const qty = Number(item.qty) || 0;
    if (qty >= 0) continue;
    const hpp = await getHppBarang(conn, item.brgKode, gudang);
    await conn.query(
      `INSERT INTO tmasterstok
         (mst_brg_kode, mst_gdg_kode, mst_stok_in, mst_stok_out,
          mst_expired_date, mst_hargabeli, mst_noreferensi, mst_tanggal, mst_avgcost)
       VALUES (?, ?, ?, 0, '0000-00-00', ?, ?, ?, ?)`,
      [item.brgKode, gudang, Math.abs(qty), hpp, nomor, tanggal, hpp]
    );
  }
};

const getCustomerOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT cus_kode AS kode, cus_nama AS nama, cus_alamat AS alamat, cus_telp AS telp, cus_top AS top
     FROM tcustomer
     WHERE cus_nama LIKE ? OR cus_kode LIKE ?
     LIMIT 15`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getBarangOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT
        brg_kode      AS kode,
        brg_kode      AS barcode,
        brg_nama      AS nama,
        brg_satuan    AS satuan,
        brg_hrgjual   AS hrgJual,
        brg_hrgbeli   AS hrgBeli
     FROM tbarang
     WHERE brg_nama LIKE ? OR brg_kode LIKE ?
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── Daftar Uang Muka customer (dari Penerimaan Lain-Lain) ─────────────
// Sumber: detail jurnal 'Penerimaan Lain' di database konveksi yang baris
// kreditnya memakai akun UANG MUKA PENJUALAN (tcabang.cbg_rek_umpenjualan,
// fallback 19.001) DAN customer-nya sama dengan customer nota penjualan.
// Sisa = nilai deposit dikurangi yang sudah dipakai nota lain
// (tso_hdr.so_um_nomor). Nomor nota yang sedang diedit dikecualikan agar
// sisa tidak dipotong dua kali.
const REK_UMPENJUALAN = "19.001"; // UANG MUKA PENJUALAN (fallback bila cabang belum setting)
const getUangMukaOptions = async (cusKode, search = "", excludeNomor = "", cabang = "00") => {
  if (!cusKode) return [];

  // Akun uang muka penjualan sesuai setting jurnal penjualan cabang
  const [[cbg]] = await db.query(
    `SELECT cbg_rek_umpenjualan FROM tcabang WHERE cbg_kode = ?`,
    [String(cabang || "00")]
  );
  const rekUm = String(cbg?.cbg_rek_umpenjualan || "").trim() || REK_UMPENJUALAN;

  // Urutan sesuai posisi placeholder di SQL:
  //   1) IFNULL(?, '') subquery TERPAKAI (di SELECT list, muncul dulu)
  //   2) jurd_cus_kode = ?  (customer nota)
  //   3) jurd_rek_kode = ?  (akun uang muka penjualan)
  const params = [String(excludeNomor || ""), String(cusKode), rekUm];
  let where = `
       j.jur_tipetransaksi = 'Penerimaan Lain'
       AND j.jur_isclosed = 0
       AND d.jurd_kredit > 0
       AND d.jurd_cus_kode = ?
       AND d.jurd_rek_kode = ?`;
  if (search && String(search).trim()) {
    where += ` AND (j.jur_no LIKE ? OR IFNULL(j.jur_keterangan, '') LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  const [rows] = await db.query(
    `SELECT
        j.jur_no AS nomor,
        DATE_FORMAT(j.jur_tanggal, '%Y-%m-%d') AS tanggal,
        IFNULL(j.jur_keterangan, '') AS keterangan,
        d.jurd_rek_kode AS rek,
        IFNULL(r.rek_nama, '') AS rekNama,
        IFNULL(d.jurd_cus_kode, '') AS cusKode,
        (SELECT c.cus_nama FROM tcustomer c WHERE c.cus_kode = d.jurd_cus_kode) AS cusNama,
        d.jurd_kredit AS nilai,
        IFNULL((SELECT SUM(h2.so_umpenjualan) FROM tso_hdr h2
                WHERE h2.so_um_nomor = d.jurd_jur_no
                  AND h2.so_nomor <> IFNULL(?, '')), 0) AS terpakai
     FROM tjurnalitem d
     INNER JOIN tjurnal j ON j.jur_no = d.jurd_jur_no
     LEFT JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
     WHERE ${where}
      ORDER BY j.jur_tanggal DESC, j.jur_no DESC
     LIMIT 50`,
    params
  );
  return rows.map((x) => ({
    ...x,
    nilai: Number(x.nilai) || 0,
    terpakai: Number(x.terpakai) || 0,
    sisa: (Number(x.nilai) || 0) - (Number(x.terpakai) || 0),
  }));
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT so_nomor AS nomor, DATE_FORMAT(so_tanggal, '%Y-%m-%d') AS tanggal,
            so_cus_kode AS cusKode,
            (SELECT c.cus_nama FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusNama,
            (SELECT c.cus_alamat FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusAlamat,
            (SELECT c.cus_telp FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusTelp,
            (SELECT c.cus_top FROM tcustomer c WHERE c.cus_kode = so_cus_kode) AS cusTop,
            so_memo AS memo, so_istax AS isTax, so_disc_fakturpr AS discFakturPr, so_disc_faktur AS discFaktur,
            so_amount AS amount, so_taxamount AS taxAmount,
            IFNULL(so_ongkir, 0) AS ongkir, IFNULL(so_bayar, 0) AS bayar, IFNULL(so_kembali, 0) AS kembali,
            IFNULL(so_dp, 0) AS dp,
            IFNULL(so_voucher, 0) AS voucher, IFNULL(so_no_voucher, '') AS noVoucher,
            IFNULL(so_card, 0) AS card, IFNULL(so_no_card, '') AS noCard, IFNULL(so_bank_card, '') AS bankCard,
            IFNULL(so_piutang, 0) AS piutang,
            IFNULL(so_umpenjualan, 0) AS umPenjualan, IFNULL(so_um_nomor, '') AS umNomor,
            DATE_FORMAT(so_dateline, '%Y-%m-%d') AS dateline, so_pemesan AS pemesan
     FROM tso_hdr WHERE so_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("Penjualan tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT d.sod_nourut AS no, d.sod_brg_kode AS brgKode, b.brg_nama AS brgNama, b.brg_kode AS barcode,
            d.sod_brg_satuan AS satuan, d.sod_qty AS qty, d.sod_harga AS harga, d.sod_discpr AS discPr,
            d.sod_keterangan AS keterangan
     FROM tso_dtl d
     LEFT JOIN tbarang b ON d.sod_brg_kode = b.brg_kode
     WHERE d.sod_so_nomor = ? ORDER BY d.sod_nourut ASC`,
    [nomor]
  );

  h.detail = detail;
  return h;
};

const saveData = async (payload, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const {
      isEdit,
      nomor,
      tanggal,
      cusKode,
      memo,
      isTax,
      discFakturPr,
      discFaktur,
      amount,
      taxAmount,
      ongkir,
      bayar,
      voucher,
      noVoucher,
      card,
      noCard,
      bankCard,
      piutang,
      umPenjualan,
      umNomor,
      dateline,
      pemesan,
      detail,
    } = payload;
    const now = new Date();
    const username = user?.username || user?.kode || "ADMIN";
    let actualNomor = nomor;

    if (!cusKode) throw new Error("Customer harus dipilih.");
    if (!Array.isArray(detail) || detail.length === 0) {
      throw new Error("Detail barang tidak boleh kosong.");
    }

    // ── Pembayaran multi-jenis (pola kasir minimarket) ─────────────────
    // Jalur: cash (bayar) + voucher + card + piutang. Total semua jalur
    // harus >= grand total (amount + ongkir). Kembalian & kas neto dihitung
    // ulang di server supaya konsisten.
    const ongkirVal = Number(ongkir) || 0;
    const grandTotal = (Number(amount) || 0) + ongkirVal;
    const bayarVal = Number(bayar) || 0; // cash/tunai
    const voucherVal = Number(voucher) || 0;
    const cardVal = Number(card) || 0;
    const piutangVal = Number(piutang) || 0;
    const umVal = Number(umPenjualan) || 0;
    const umNomorVal = String(umNomor || "").trim();
    const totalBayar = bayarVal + voucherVal + cardVal + piutangVal + umVal;

    // ── Uang Muka (Penerimaan Lain-Lain) harus dipilih lewat tombol search ──
    if (umVal !== 0) {
      if (!umNomorVal) {
        throw new Error("Uang muka harus dipilih lewat tombol search (nomor penerimaan lain-lain wajib).");
      }
      const [[umRow]] = await conn.query(
        `SELECT jurd_cus_kode, jurd_rek_kode FROM tjurnalitem
          WHERE jurd_jur_no = ? AND jurd_kredit > 0 LIMIT 1`,
        [umNomorVal]
      );
      if (!umRow) {
        throw new Error(`Nomor penerimaan lain-lain ${umNomorVal} tidak ditemukan.`);
      }
      // Baris kredit deposit harus memakai akun UANG MUKA PENJUALAN sesuai
      // setting jurnal penjualan cabang (fallback 19.001)
      const [[cbgUm]] = await conn.query(
        `SELECT cbg_rek_umpenjualan FROM tcabang WHERE cbg_kode = ?`,
        [String(user?.cabang || "00")]
      );
      const rekUmSetting = String(cbgUm?.cbg_rek_umpenjualan || "").trim() || REK_UMPENJUALAN;
      if (String(umRow.jurd_rek_kode || "").trim() !== rekUmSetting) {
        throw new Error(
          `Uang muka ${umNomorVal} bukan deposit akun Uang Muka Penjualan (${rekUmSetting}).`
        );
      }
      // Customer dari penerimaan lain harus sama dengan customer nota
      const umCus = String(umRow.jurd_cus_kode || "").trim();
      if (umCus && umCus !== String(cusKode)) {
        throw new Error(
          `Uang muka ${umNomorVal} milik customer ${umCus}, tidak boleh dipakai untuk ${cusKode}.`
        );
      }
      // Nilai uang muka tidak boleh melebihi sisa deposit yang belum dipakai
      const [[umAvail]] = await conn.query(
        `SELECT d.jurd_kredit AS nilai,
                IFNULL((SELECT SUM(h2.so_umpenjualan) FROM tso_hdr h2
                        WHERE h2.so_um_nomor = d.jurd_jur_no AND h2.so_nomor <> ?), 0) AS terpakai
           FROM tjurnalitem d
          WHERE d.jurd_jur_no = ? AND d.jurd_kredit > 0 LIMIT 1`,
        [actualNomor || "", umNomorVal]
      );
      const sisa = Math.round((Number(umAvail?.nilai) || 0) - (Number(umAvail?.terpakai) || 0));
      if (umVal > sisa) {
        throw new Error(
          `Nilai uang muka (${umVal.toLocaleString("id-ID")}) melebihi sisa deposit ${umNomorVal} (${sisa.toLocaleString("id-ID")}).`
        );
      }
      // Uang muka hanya untuk customer terdaftar (bukan UMUM) — sama seperti piutang
      const [[cus]] = await conn.query(
        `SELECT cus_nama FROM tcustomer WHERE cus_kode = ?`,
        [cusKode]
      );
      const nama = String(cus?.cus_nama || "").toLowerCase();
      if (cusKode === "PU" || nama.includes("umum")) {
        throw new Error("Pembayaran UANG MUKA tidak boleh untuk customer UMUM. Pilih customer terlebih dahulu.");
      }
    }
    // Fasilitas retur: qty minus diperbolehkan, tapi total tagihan tidak
    // boleh minus (tidak ada uang kembali). Retur melebihi belanja harus
    // ditambal dengan belanja barang lain.
    if (grandTotal < 0) {
      throw new Error(
        `Nilai retur melebihi total belanja (${grandTotal.toLocaleString("id-ID")}). ` +
        `Tidak boleh kembali uang — tambahkan belanja barang lain yang melebihi nilai yang di-retur.`
      );
    }
    if (totalBayar < grandTotal) {
      throw new Error(
        `Total pembayaran (${totalBayar.toLocaleString("id-ID")}) kurang dari total tagihan (${grandTotal.toLocaleString("id-ID")}).`
      );
    }
    const kembaliVal = Math.max(0, Math.round(totalBayar - grandTotal));
    // Kas tunai yang benar-benar masuk laci = cash - kembalian
    const dpVal = Math.max(0, Math.round(bayarVal - kembaliVal));

    // Piutang/bon tidak boleh untuk customer UMUM (tidak bisa ditagih)
    if (piutangVal > 0) {
      const [[cus]] = await conn.query(
        `SELECT cus_nama FROM tcustomer WHERE cus_kode = ?`,
        [cusKode]
      );
      const nama = String(cus?.cus_nama || "").toLowerCase();
      if (cusKode === "PU" || nama.includes("umum")) {
        throw new Error("Penjualan PIUTANG tidak boleh untuk customer UMUM. Pilih customer terlebih dahulu.");
      }
    }

    if (isEdit) {
      const [[current]] = await conn.query(
        `SELECT so_status_rec, so_isclosed FROM tso_hdr WHERE so_nomor = ?`,
        [actualNomor]
      );
      if (!current) throw new Error("Data penjualan tidak ditemukan.");
      if (current.so_status_rec > 0) throw new Error("Penjualan tidak bisa diubah karena sudah ada pengiriman.");
      if (current.so_isclosed === 1) throw new Error("Penjualan berstatus Closed tidak bisa diubah.");

      await conn.query(`DELETE FROM tso_dtl WHERE sod_so_nomor = ?`, [actualNomor]);
      await conn.query(
        `UPDATE tso_hdr SET so_tanggal=?, so_cus_kode=?, so_memo=?, so_istax=?, so_disc_fakturpr=?, so_disc_faktur=?,
                            so_amount=?, so_taxamount=?, so_ongkir=?, so_bayar=?, so_kembali=?, so_dp=?,
                            so_voucher=?, so_no_voucher=?, so_card=?, so_no_card=?, so_bank_card=?, so_piutang=?,
                            so_umpenjualan=?, so_um_nomor=?,
                            date_modified=?, user_modified=?, so_dateline=?, so_pemesan=?
         WHERE so_nomor=?`,
        [
          tanggal,
          cusKode,
          memo || "",
          isTax,
          discFakturPr || 0,
          discFaktur || 0,
          amount,
          taxAmount,
          ongkirVal,
          bayarVal,
          kembaliVal,
          dpVal,
          voucherVal,
          noVoucher || "",
          cardVal,
          noCard || "",
          bankCard || "",
          piutangVal,
          umVal,
          umNomorVal,
          now,
          username,
          dateline || null,
          pemesan || "",
          actualNomor,
        ]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      // Nomor penjualan membawa kode cabang login: SO{cbg}.yymm.nnnn
      // (contoh: SO.2610.0001 untuk pusat, SO01.2610.0001 untuk cabang 01).
      const cabangKode = String(user?.cabang || "00");
      const suffixCabang = cabangKode !== "00" ? String(Number(cabangKode)) : "";
      const prefix = `SO${suffixCabang}.${yy}${mm}.`;
      const isPajak = Number(isTax) > 0;
      const rangeStart = isPajak ? 1 : 5001;
      const rangeEnd = isPajak ? 4999 : 9999;

      lockKey = `nomor_so_${cabangKode}_${yy}${mm}_${isPajak ? "pjk" : "nonpjk"}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT so_nomor FROM tso_hdr
         WHERE so_nomor LIKE ?
           AND CAST(SUBSTRING_INDEX(so_nomor, '.', -1) AS UNSIGNED) BETWEEN ? AND ?
         ORDER BY so_nomor DESC LIMIT 1`,
        [`${prefix}%`, rangeStart, rangeEnd]
      );
      let nextNum = rangeStart;
      if (maxRow?.so_nomor) {
        const parts = maxRow.so_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      if (nextNum > rangeEnd) {
        throw new Error(`Kuota nomor penjualan ${isPajak ? "Pajak" : "Non-Pajak"} untuk periode ${yy}${mm} sudah habis.`);
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      await conn.query(
        `INSERT INTO tso_hdr (so_nomor, so_tanggal, so_cus_kode, so_memo, so_istax, so_disc_fakturpr, so_disc_faktur,
                               so_amount, so_taxamount, so_ongkir, so_bayar, so_kembali, so_dp,
                               so_voucher, so_no_voucher, so_card, so_no_card, so_bank_card, so_piutang,
                               so_umpenjualan, so_um_nomor,
                               date_create, user_create, so_dateline, so_pemesan, so_user_kasir)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actualNomor,
          tanggal,
          cusKode,
          memo || "",
          isTax,
          discFakturPr || 0,
          discFaktur || 0,
          amount,
          taxAmount,
          ongkirVal,
          bayarVal,
          kembaliVal,
          dpVal,
          voucherVal,
          noVoucher || "",
          cardVal,
          noCard || "",
          bankCard || "",
          piutangVal,
          umVal,
          umNomorVal,
          now,
          username,
          dateline || null,
          pemesan || "",
          username,
        ]
      );
    }

    let index = 1;
    for (const item of detail) {
      await conn.query(
        `INSERT INTO tso_dtl (sod_so_nomor, sod_brg_kode, sod_brg_satuan, sod_qty, sod_discpr, sod_harga, sod_keterangan, sod_nourut, brg_kode_lama)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actualNomor,
          item.brgKode,
          item.satuan,
          item.qty,
          item.discPr || 0,
          item.harga,
          item.keterangan || "",
          index,
          item.brgKodeLama || item.kodeLama || "-",
        ]
      );
      index++;
    }

    // ── Kartu stok: pengurangan stok penjualan langsung (idempotent per nomor) ──
    const gudangPenjualan = await getGudangPenjualan(conn, user?.cabang);
    await simpanKartuStokPenjualan(conn, {
      nomor: actualNomor,
      gudang: gudangPenjualan,
      tanggal,
      detail,
      user: username,
    });

    // ── Jurnal otomatis penjualan (nomor = nomor SO) ───────────────────
    await createAutoJurnalPenjualan(conn, { nomor: actualNomor, user: username, cabang: user?.cabang });

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

// ── SISTEM PENDING (HOLD) KASIR — porting dari kasir minimarket ───────
// Simpan keranjang sebagai nota pending, ambil lagi saat lanjut bayar.
// Tidak membuat nota (SO). Nomor: PND.{yymmdd}.nnnn.

const savePending = async (payload, user) => {
  const { cusKode, memo, detail } = payload;
  if (!Array.isArray(detail) || detail.length === 0) {
    throw new Error("Keranjang kosong — tidak ada yang bisa dipending.");
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const now = new Date();
    const tanggal = now.toISOString().slice(0, 19).replace("T", " ");
    const cabangKode = String(user?.cabang || "00");
    const username = user?.username || user?.kode || "ADMIN";
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const prefix = `PND.${yy}${mm}${dd}.`;

    lockKey = `nomor_pnd_${yy}${mm}${dd}`;
    await acquireLock(conn, lockKey);

    const [[maxRow]] = await conn.query(
      `SELECT pen_nomor FROM tpending_hdr WHERE pen_nomor LIKE ? ORDER BY pen_nomor DESC LIMIT 1`,
      [`${prefix}%`]
    );
    let nextNum = 1;
    if (maxRow?.pen_nomor) {
      nextNum = parseInt(maxRow.pen_nomor.split(".")[2], 10) + 1;
    }
    const noPending = `${prefix}${String(nextNum).padStart(4, "0")}`;

    await conn.query(
      `INSERT INTO tpending_hdr
         (pen_nomor, pen_tanggal, pen_cus_kode, pen_memo, pen_amount,
          pen_user_kasir, pen_cabang, date_create, user_create)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, NOW(), ?)`,
      [noPending, cusKode || null, memo || "", sumPendingAmount(detail), username, cabangKode, username]
    );

    let index = 1;
    for (const item of detail) {
      await conn.query(
        `INSERT INTO tpending_dtl
           (ped_pen_nomor, ped_brg_kode, ped_brg_satuan, ped_qty, ped_harga, ped_discpr, ped_nourut)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [noPending, item.brgKode, item.satuan, item.qty, item.harga, item.discPr || 0, index]
      );
      index++;
    }

    await conn.commit();
    return { nomor: noPending };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    if (lockKey) await releaseLock(conn, lockKey);
    conn.release();
  }
};

const sumPendingAmount = (detail) =>
  detail.reduce(
    (s, d) =>
      s + (Number(d.qty) || 0) * (Number(d.harga) || 0) * (1 - (Number(d.discPr) || 0) / 100),
    0
  );

// Daftar nota pending (urut waktu pending DESC). Cabang login (bukan pusat)
// hanya melihat pending milik cabangnya; pusat melihat semua.
const getPendingList = async (user) => {
  const cabang = String(user?.cabang || "00");
  const params = [];
  let where = "";
  if (cabang !== "00") {
    where = `WHERE h.pen_cabang = ?`;
    params.push(cabang);
  }
  const [rows] = await db.query(
    `SELECT
        h.pen_nomor AS noPending,
        DATE_FORMAT(h.pen_tanggal, '%d/%m/%Y %H:%i') AS tanggal,
        IFNULL(h.pen_amount, 0) AS total,
        IFNULL(c.cus_nama, 'UMUM') AS customer,
        h.pen_cus_kode AS cusKode,
        h.pen_user_kasir AS kasir,
        (SELECT COUNT(*) FROM tpending_dtl d WHERE d.ped_pen_nomor = h.pen_nomor) AS jumlahItem
     FROM tpending_hdr h
     LEFT JOIN tcustomer c ON c.cus_kode = h.pen_cus_kode
     ${where}
     ORDER BY h.pen_tanggal DESC`,
    params
  );
  return rows;
};

// Ambil nota pending: kembalikan header+detail lalu HAPUS dari antrean
// (tidak bisa ditarik 2x — sama seperti logika UfrmKasir.pas minimarket).
const takePending = async (noPending, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const [[header]] = await conn.query(
      `SELECT pen_nomor, pen_cus_kode AS cusKode, pen_memo AS memo, pen_amount AS amount
         FROM tpending_hdr WHERE pen_nomor = ?`,
      [noPending]
    );
    if (!header) throw new Error("Notak pending tidak ditemukan / sudah diambil.");

    const cabang = String(user?.cabang || "00");
    if (cabang !== "00") {
      const [[row]] = await conn.query(
        `SELECT pen_cabang FROM tpending_hdr WHERE pen_nomor = ?`,
        [noPending]
      );
      if (row?.pen_cabang && row.pen_cabang !== cabang) {
        throw new Error("Nota pending milik cabang lain.");
      }
    }

    const [details] = await conn.query(
      `SELECT
          d.ped_brg_kode AS brgKode,
          IFNULL(b.brg_nama, '') AS brgNama,
          b.brg_kode AS barcode,
          IFNULL(d.ped_brg_satuan, '') AS satuan,
          d.ped_qty AS qty,
          d.ped_harga AS harga,
          IFNULL(d.ped_discpr, 0) AS discPr
       FROM tpending_dtl d
       LEFT JOIN tbarang b ON b.brg_kode = d.ped_brg_kode
       WHERE d.ped_pen_nomor = ?
       ORDER BY d.ped_nourut ASC`,
      [noPending]
    );

    await conn.query(`DELETE FROM tpending_dtl WHERE ped_pen_nomor = ?`, [noPending]);
    await conn.query(`DELETE FROM tpending_hdr WHERE pen_nomor = ?`, [noPending]);

    await conn.commit();
    return { header, details };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = {
  getCustomerOptions, getBarangOptions, getUangMukaOptions, getDetailForm, saveData,
  savePending, getPendingList, takePending,
};
