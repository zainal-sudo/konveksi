const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");
const { createAutoJurnalRetur } = require("../../utils/jurnalRetur");
const { cekTutupPeriode } = require("../tutupBukuService");

const getSupplierOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT sup_kode AS kode, sup_nama AS nama FROM tsupplier 
     WHERE sup_nama LIKE ? OR sup_kode LIKE ? LIMIT 15`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getRekeningOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT rek_kode AS kode, rek_nama AS nama FROM trekening 
     WHERE rek_nama LIKE ? OR rek_kode LIKE ? LIMIT 15`,
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
        brg_hrgbeli   AS hrgBeli
     FROM tbarang 
     WHERE brg_nama LIKE ? OR brg_kode LIKE ?
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getGudangOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama, gdg_penanggungjawab AS pj
     FROM tgudang
     WHERE gdg_nama LIKE ? OR gdg_kode LIKE ?
     ORDER BY gdg_kode ASC
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// ─────────────────────────────────────────────────────────────────────
// ✅ FIX BUG: sebelumnya query ini pakai `h.inv_sup_kode`, padahal kolom
// itu TIDAK PERNAH diisi saat invoice dibuat (cek invFormService.saveData
// — INSERT ke tinv_hdr tidak menyertakan inv_sup_kode sama sekali).
// Akibatnya kolom SUPPLIER di modal "Pilih Invoice Sumber Retur" selalu
// kosong/NULL. Sekarang supplier diambil dengan cara yang sama seperti
// di invFormService: Invoice → BPB → PO → Supplier.
//
// ✅ FIX INTEGRASI: ikut sertakan isTax/discFakturPr/discFaktur dari
// invoice supaya form Retur bisa auto-fill & mengunci pajak sesuai
// invoice sumbernya (tidak boleh dipilih manual lagi).
// ─────────────────────────────────────────────────────────────────────
// ✅ FIX: invoice yang sudah LUNAS tidak boleh diretur lagi -- dikeluarkan
// dari daftar pilihan "Pilih Invoice Sumber Retur". Status lunas dihitung
// dari inv_bayar >= inv_amount (bukan cuma flag inv_isbayar), konsisten
// dgn StatusBayar di Browse Invoice.
const getInvoiceOptions = async (search = "") => {
  const [rows] = await db.query(
    `SELECT h.inv_nomor AS nomor, DATE_FORMAT(h.inv_tanggal, '%Y-%m-%d') AS tanggal,
            h.inv_bpb_nomor AS bpbNomor, p.po_sup_kode AS supKode, s.sup_nama AS supNama,
            bh.bpb_gdg_kode AS gdgKode, g.gdg_nama AS gdgNama,
            h.inv_istax AS isTax, h.inv_disc_fakturpr AS discFakturPr, h.inv_disc_faktur AS discFaktur
     FROM tinv_hdr h
     LEFT JOIN tbpb_hdr bh ON h.inv_bpb_nomor = bh.bpb_nomor
     LEFT JOIN tpo_hdr p   ON bh.bpb_po_nomor = p.po_nomor
     LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
     LEFT JOIN tgudang g   ON bh.bpb_gdg_kode = g.gdg_kode
     WHERE (h.inv_nomor LIKE ? OR s.sup_nama LIKE ?)
       AND IFNULL(h.inv_bayar, 0) = 0
     ORDER BY h.inv_nomor DESC
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getInvoiceDetail = async (invNomor, excludeRetNomor = null) => {
  try {
    const [rows] = await db.query(
      `SELECT 
          d.invd_brg_kode AS kode, 
          b.brg_nama AS nama, 
          b.brg_kode AS barcode,
          d.invd_brg_satuan AS satuan, 
          d.invd_harga AS hrgBeli,
          d.invd_discpr AS discPr,
          d.invd_qty AS qtyInvoice,
          IFNULL(sudah.qtySudahRetur, 0) AS qtySudahRetur,
          (d.invd_qty - IFNULL(sudah.qtySudahRetur, 0)) AS qtySisa,
          DATE_FORMAT(d.invd_expired, '%Y-%m-%d') AS expired
       FROM tinv_dtl d
       LEFT JOIN tbarang b ON d.invd_brg_kode = b.brg_kode
       LEFT JOIN (
         SELECT rd.retd_brg_kode, SUM(rd.retd_qty) AS qtySudahRetur
         FROM tret_dtl rd
         INNER JOIN tret_hdr rh ON rd.retd_ret_nomor = rh.ret_nomor
         WHERE rh.ret_inv_nomor = ?
           AND (? IS NULL OR rh.ret_nomor != ?)
         GROUP BY rd.retd_brg_kode
       ) sudah ON sudah.retd_brg_kode = d.invd_brg_kode
       WHERE d.invd_inv_nomor = ?
       ORDER BY d.invd_nourut ASC`,
      [invNomor, excludeRetNomor, excludeRetNomor, invNomor]
    );
    return rows;
  } catch (e) {
    console.error("❌ SERVICE getInvoiceDetail ERROR:", e.message, e.sqlMessage || "");
    throw e;
  }
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT ret_nomor AS nomor, DATE_FORMAT(ret_tanggal, '%Y-%m-%d') AS tanggal,
            ret_sup_kode AS supKode, (SELECT s.sup_nama FROM tsupplier s WHERE s.sup_kode = ret_sup_kode) AS supNama,
            ret_gdg_kode AS gdgKode, ret_inv_nomor AS invNomor, ret_memo AS memo, ret_istax AS isTax, 
            ret_disc_fakturpr AS discFakturPr, ret_disc_faktur AS discFaktur, ret_amount AS amount, ret_taxamount AS taxAmount
     FROM tret_hdr WHERE ret_nomor = ?`, [nomor]
  );
  if (!h) throw new Error("Data Retur tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT d.retd_nourut AS no, d.retd_brg_kode AS brgKode, b.brg_nama AS brgNama, b.brg_kode AS barcode,
            d.retd_brg_satuan AS satuan, d.retd_qty AS qty, d.retd_harga AS harga, d.retd_discpr AS discPr,
            DATE_FORMAT(d.retd_expired, '%Y-%m-%d') AS expired
     FROM tret_dtl d
     LEFT JOIN tbarang b ON d.retd_brg_kode = b.brg_kode
     WHERE d.retd_ret_nomor = ? ORDER BY d.retd_nourut ASC`, [nomor]
  );

  h.detail = detail;
  return h;
};

// Validator qty retur vs qty invoice (server-side, tidak bisa dibypass).
const validateQtyAgainstInvoice = async (conn, invNomor, detail, excludeRetNomor) => {
  const [invRows] = await conn.query(
    `SELECT invd_brg_kode AS brgKode, invd_qty AS qtyInvoice
     FROM tinv_dtl WHERE invd_inv_nomor = ?`,
    [invNomor]
  );
  const invoiceMap = new Map(invRows.map((r) => [String(r.brgKode), Number(r.qtyInvoice) || 0]));

  const [sudahRows] = await conn.query(
    `SELECT rd.retd_brg_kode AS brgKode, SUM(rd.retd_qty) AS qtySudah
     FROM tret_dtl rd
     INNER JOIN tret_hdr rh ON rd.retd_ret_nomor = rh.ret_nomor
     WHERE rh.ret_inv_nomor = ?
       AND (? IS NULL OR rh.ret_nomor != ?)
     GROUP BY rd.retd_brg_kode`,
    [invNomor, excludeRetNomor, excludeRetNomor]
  );
  const sudahMap = new Map(sudahRows.map((r) => [String(r.brgKode), Number(r.qtySudah) || 0]));

  const mintaMap = new Map();
  for (const item of detail) {
    const key = String(item.brgKode);
    mintaMap.set(key, (mintaMap.get(key) || 0) + (Number(item.qty) || 0));
  }

  for (const [brgKode, qtyMinta] of mintaMap) {
    if (!invoiceMap.has(brgKode)) {
      throw new Error(`Barang kode "${brgKode}" tidak ada di invoice sumber. Retur ditolak.`);
    }
    const qtyInvoice = invoiceMap.get(brgKode);
    const qtySudah = sudahMap.get(brgKode) || 0;
    const qtySisa = qtyInvoice - qtySudah;

    if (qtyMinta > qtySisa) {
      throw new Error(
        `Qty retur untuk barang kode "${brgKode}" (${qtyMinta}) melebihi sisa yang boleh diretur ` +
        `(${qtySisa} dari total invoice ${qtyInvoice}, sudah diretur ${qtySudah}).`
      );
    }
  }
};

// ─────────────────────────────────────────────────────────────────────
// ✅ FIX: hitung ulang total retur DI SERVER, samakan rumus dengan
// returFormView.vue (discFaktur nominal ditimpa hasil % kalau discFakturPr>0).
// ─────────────────────────────────────────────────────────────────────
const computeTotals = (detail, discFakturPr, discFakturInput, isTax) => {
  const bruto = detail.reduce((s, d) => {
    const qty = Number(d.qty) || 0;
    const harga = Number(d.harga) || 0;
    const discPr = Number(d.discPr) || 0;
    const total = qty * harga;
    return s + (total - (total * discPr) / 100);
  }, 0);

  const discFaktur = discFakturPr > 0
    ? Math.round((bruto * discFakturPr) / 100)
    : (Number(discFakturInput) || 0);

  const setelahDiskonFaktur = bruto - discFaktur;

  let taxAmount = 0;
  let amount = setelahDiskonFaktur;

  if (isTax > 0) {
    if (isTax === 2) {
      taxAmount = Math.round((setelahDiskonFaktur * 11) / 100);
      amount = setelahDiskonFaktur + taxAmount;
    } else {
      taxAmount = Math.round((setelahDiskonFaktur * 11) / 111);
      amount = setelahDiskonFaktur;
    }
  }

  return { discFaktur: Math.round(discFaktur), amount: Math.round(amount), taxAmount: Math.round(taxAmount) };
};

// ─────────────────────────────────────────────────────────────────────
// ✅ FIX INTEGRASI UTAMA: isTax & discFakturPr TIDAK lagi dipercaya dari
// payload client. Server mengambil ulang setting pajak & diskon dari
// Invoice sumber (ret_inv_nomor) sebagai SUMBER KEBENARAN — retur tidak
// boleh punya term pajak berbeda dari invoice aslinya. amount/taxAmount
// juga dihitung ulang di server.
// ─────────────────────────────────────────────────────────────────────
const saveData = async (payload, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const { 
      isEdit, nomor, tanggal, supKode, gdgKode, invNomor, memo, detail 
    } = payload;

    if (!invNomor || !invNomor.trim()) {
      throw new Error("No. Invoice Asal wajib dipilih.");
    }
    const [[inv]] = await conn.query(
      `SELECT inv_nomor, inv_istax AS isTax, inv_disc_fakturpr AS discFakturPr,
              inv_amount, IFNULL(inv_bayar, 0) AS inv_bayar
       FROM tinv_hdr WHERE inv_nomor = ?`,
      [invNomor]
    );
    if (!inv) {
      throw new Error(`Nomor Invoice "${invNomor}" tidak ditemukan di sistem. Pilih invoice yang valid dari daftar.`);
    }
    if (Number(inv.inv_bayar) > 0) {
      throw new Error(`Invoice "${invNomor}" sudah ada pembayaran (Rp ${Number(inv.inv_bayar).toLocaleString("id-ID")}) dan tidak bisa diretur lagi.`);
    }

    if (!Array.isArray(detail) || detail.length === 0) {
      throw new Error("Detail barang tidak boleh kosong.");
    }

    // Jurnal otomatis retur memakai tanggal retur — blokir periode tertutup.
    const tutup = await cekTutupPeriode(tanggal);
    if (tutup) throw new Error("Periode sudah ditutup. Tidak bisa menyimpan retur.");
    for (const item of detail) {
      if (!item.expired || !item.expired.trim()) {
        throw new Error(
          `Tanggal expired untuk item "${item.brgNama || item.brgKode}" tidak ditemukan. ` +
          `Pastikan invoice sumber retur memiliki data expired yang valid.`
        );
      }
    }

    // Validasi qty retur vs qty invoice (tidak bisa dibypass).
    await validateQtyAgainstInvoice(conn, invNomor, detail, isEdit ? nomor : null);

    // 🔒 Pajak & diskon faktur WAJIB ikut Invoice sumber, bukan input client.
    const isTax = inv.isTax || 0;
    const discFakturPr = inv.discFakturPr || 0;
    const { discFaktur, amount, taxAmount } = computeTotals(
      detail, discFakturPr, payload.discFaktur, isTax
    );

    const now = new Date();
    const username = user?.username || "ADMIN";
    let actualNomor = nomor;

    if (isEdit) {
      await conn.query(`DELETE FROM tret_dtl WHERE retd_ret_nomor = ?`, [actualNomor]);
      await conn.query(
        `UPDATE tret_hdr SET 
          ret_tanggal=?, ret_sup_kode=?, ret_gdg_kode=?, ret_inv_nomor=?, ret_memo=?, 
          ret_istax=?, ret_disc_fakturpr=?, ret_disc_faktur=?, ret_amount=?, ret_taxamount=?, 
          date_modified=?, user_modified=? 
         WHERE ret_nomor=?`,
        [
          tanggal, supKode, gdgKode || "", invNomor || "", memo || "", 
          isTax, discFakturPr, discFaktur, amount, taxAmount, 
          now, username, actualNomor
        ]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `RET.${yy}${mm}.`;

      // Kunci atomik supaya 2 request bersamaan tidak dapat nomor yang sama.
      lockKey = `nomor_ret_${yy}${mm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT ret_nomor FROM tret_hdr WHERE ret_nomor LIKE ? ORDER BY ret_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.ret_nomor) {
        const parts = maxRow.ret_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      await conn.query(
        `INSERT INTO tret_hdr 
          (ret_nomor, ret_tanggal, ret_sup_kode, ret_gdg_kode, ret_inv_nomor, ret_memo, 
           ret_istax, ret_disc_fakturpr, ret_disc_faktur, ret_amount, ret_taxamount, date_create, user_create)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actualNomor, tanggal, supKode, gdgKode || "", invNomor || "", memo || "", 
          isTax, discFakturPr, discFaktur, amount, taxAmount, now, username
        ]
      );
    }

    let index = 1;
    for (const item of detail) {
      await conn.query(
        `INSERT INTO tret_dtl
          (retd_ret_nomor, retd_brg_kode, retd_brg_satuan, retd_qty, retd_harga, retd_discpr, retd_nourut, retd_expired)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actualNomor, item.brgKode, item.satuan, item.qty, item.harga,
          item.discPr || 0, index, item.expired
        ]
      );
      index++;
    }

    // ── Jurnal otomatis retur ────────────────────────────────────────
    // Cr Persediaan (per jenis barang) + Cr PPN Masukan
    //   vs Dr Pot. Pembelian + Dr Hutang Dagang (cermin jurnal invoice)
    const [[supRow]] = await conn.query(
      `SELECT sup_nama AS supNama FROM tsupplier WHERE sup_kode = ?`,
      [supKode]
    );
    await createAutoJurnalRetur(conn, {
      nomor: actualNomor,
      tanggal,
      isTax,
      taxAmount,
      discTotal: discFaktur,
      amount,
      detail,
      supNama: supRow?.supNama || "",
      user: username,
    });

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    console.error("❌ SERVICE saveData ERROR:", e.message, e.sqlMessage || "");
    throw e;
  } finally {
    if (lockKey) await releaseLock(conn, lockKey);
    conn.release();
  }
};

module.exports = { getSupplierOptions, getRekeningOptions, getBarangOptions, getGudangOptions, getInvoiceOptions, getInvoiceDetail, getDetailForm, saveData };