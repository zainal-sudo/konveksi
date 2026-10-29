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
    const totalBayar = bayarVal + voucherVal + cardVal + piutangVal;
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
                               date_create, user_create, so_dateline, so_pemesan, so_user_kasir)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

module.exports = { getCustomerOptions, getBarangOptions, getDetailForm, saveData };
