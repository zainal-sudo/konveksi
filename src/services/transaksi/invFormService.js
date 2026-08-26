const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

const getBpbOptions = async (search = "", includeNomor = null) => {
  const [rows] = await db.query(
    `SELECT
        h.bpb_nomor      AS nomor,
        DATE_FORMAT(h.bpb_tanggal, '%Y-%m-%d') AS tanggal,
        h.bpb_po_nomor   AS poNomor,
        p.po_sup_kode    AS supKode,
        s.sup_nama       AS supNama,
        h.bpb_memo       AS memo
     FROM tbpb_hdr h
     LEFT JOIN tpo_hdr p  ON h.bpb_po_nomor = p.po_nomor
     LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
     WHERE (h.bpb_isinvoice = 0 OR h.bpb_nomor = ?)
       AND (h.bpb_nomor LIKE ? OR s.sup_nama LIKE ? OR h.bpb_po_nomor LIKE ?)
     ORDER BY h.bpb_nomor DESC
     LIMIT 20`,
    [includeNomor, `%${search}%`, `%${search}%`, `%${search}%`]
  );
  return rows;
};

const getBpbDetail = async (bpbNomor) => {
  const [[h]] = await db.query(
    `SELECT
        h.bpb_nomor   AS nomor,
        h.bpb_po_nomor AS poNomor,
        p.po_sup_kode AS supKode,
        s.sup_nama    AS supNama,
        s.sup_alamat  AS supAlamat,
        s.sup_telp    AS supTelp,
        DATE_FORMAT(p.po_dateline, '%Y-%m-%d') AS poDateline,
        p.po_istax          AS isTax,
        p.po_disc_fakturpr  AS discFakturPr,
        p.po_disc_faktur    AS discFaktur
     FROM tbpb_hdr h
     LEFT JOIN tpo_hdr p   ON h.bpb_po_nomor = p.po_nomor
     LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
     WHERE h.bpb_nomor = ?`,
    [bpbNomor]
  );
  if (!h) throw new Error("BPB tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT
        d.bpbd_nourut     AS nourut,
        d.bpbd_brg_kode   AS brgKode,
        b.brg_nama        AS brgNama,
        b.brg_kode        AS barcode,
        d.bpbd_brg_satuan AS satuan,
        d.bpbd_qty        AS qty,
        IFNULL(pd.pod_harga, 0)   AS harga,
        IFNULL(pd.pod_discpr, 0) AS discPr,
        CASE WHEN d.bpbd_tgl_expired = '0000-00-00' THEN NULL
             ELSE DATE_FORMAT(d.bpbd_tgl_expired, '%Y-%m-%d')
        END AS expired
     FROM tbpb_dtl d
     LEFT JOIN tbarang b   ON d.bpbd_brg_kode = b.brg_kode
     LEFT JOIN tpo_dtl pd ON pd.pod_po_nomor = ? AND pd.pod_brg_kode = d.bpbd_brg_kode
     WHERE d.bpbd_bpb_nomor = ?
     ORDER BY d.bpbd_nourut ASC`,
    [h.poNomor, bpbNomor]
  );

  h.detail = detail;
  return h;
};

const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT
        i.inv_nomor       AS nomor,
        DATE_FORMAT(i.inv_tanggal, '%Y-%m-%d') AS tanggal,
        DATE_FORMAT(i.inv_jthtempo, '%Y-%m-%d') AS jthtempo,
        i.inv_bpb_nomor   AS bpbNomor,
        h.bpb_po_nomor    AS poNomor,
        p.po_sup_kode     AS supKode,
        s.sup_nama        AS supNama,
        s.sup_alamat      AS supAlamat,
        s.sup_telp        AS supTelp,
        i.inv_memo        AS memo,
        i.inv_istax       AS isTax,
        i.inv_disc_fakturpr AS discFakturPr,
        i.inv_disc_faktur   AS discFaktur,
        i.inv_amount      AS amount,
        i.inv_taxamount   AS taxAmount,
        i.inv_nobukti     AS nobukti,
        i.inv_bayar       AS bayar,
        i.inv_isbayar     AS isBayar,
        i.inv_cabang      AS cabang,
        p.po_istax          AS poIsTax,
        p.po_disc_fakturpr  AS poDiscFakturPr,
        p.po_disc_faktur    AS poDiscFaktur
     FROM tinv_hdr i
     LEFT JOIN tbpb_hdr h ON i.inv_bpb_nomor = h.bpb_nomor
     LEFT JOIN tpo_hdr p  ON h.bpb_po_nomor = p.po_nomor
     LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
     WHERE i.inv_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("Invoice tidak ditemukan.");

  const [detail] = await db.query(
    `SELECT
        d.invd_nourut     AS nourut,
        d.invd_brg_kode   AS brgKode,
        b.brg_nama        AS brgNama,
        b.brg_kode        AS barcode,
        d.invd_brg_satuan AS satuan,
        d.invd_qty        AS qty,
        d.invd_harga      AS harga,
        d.invd_discpr     AS discPr,
        CASE WHEN d.invd_expired = '0000-00-00' THEN NULL
             ELSE DATE_FORMAT(d.invd_expired, '%Y-%m-%d')
        END AS expired
     FROM tinv_dtl d
     LEFT JOIN tbarang b ON d.invd_brg_kode = b.brg_kode
     WHERE d.invd_inv_nomor = ?
     ORDER BY d.invd_nourut ASC`,
    [nomor]
  );

  h.detail = detail;
  return h;
};

// ✅ freight dihapus dari rumus — kolom itu tidak ada di tabel tinv_hdr.
const computeTotals = (detail, discFakturPr, discFaktur, isTax) => {
  const bruto = detail.reduce((s, d) => {
    const qty = Number(d.qty) || 0;
    const harga = Number(d.harga) || 0;
    const discPr = Number(d.discPr) || 0;
    const total = qty * harga;
    return s + (total - (total * discPr) / 100);
  }, 0);

  const dariPersen = Math.round((bruto * (Number(discFakturPr) || 0)) / 100);
  const dariNominal = Number(discFaktur) || 0;
  const totalDiskonFaktur = dariPersen + dariNominal;

  const setelahDiskon = bruto - totalDiskonFaktur;

  let taxAmount = 0;
  let amount = setelahDiskon;

  if (isTax > 0) {
    if (isTax === 2) {
      taxAmount = Math.round((setelahDiskon * 11) / 100);
      amount = setelahDiskon + taxAmount;
    } else {
      taxAmount = Math.round((setelahDiskon * 11) / 111);
      amount = setelahDiskon;
    }
  }

  return { amount: Math.round(amount), taxAmount: Math.round(taxAmount) };
};

const saveData = async (payload, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;
  try {
    const {
      isEdit, nomor, tanggal, jthtempo, bpbNomor, memo,
      nobukti, detail, cabang, // 👈 1. Tangkap parameter cabang dari payload frontend
    } = payload;

    if (!bpbNomor) throw new Error("Sumber BPB wajib dipilih.");
    if (!Array.isArray(detail) || detail.length === 0) {
      throw new Error("Detail barang tidak boleh kosong.");
    }

    // Ambil fallback dari token/user jika payload cabang kosong
    const activeCabang = cabang || user?.cabang || "";

    const [[poTax]] = await conn.query(
      `SELECT p.po_istax AS isTax, p.po_disc_fakturpr AS discFakturPr, p.po_disc_faktur AS discFaktur
       FROM tbpb_hdr h
       LEFT JOIN tpo_hdr p ON h.bpb_po_nomor = p.po_nomor
       WHERE h.bpb_nomor = ?`,
      [bpbNomor]
    );
    if (!poTax) throw new Error("Data PO sumber untuk BPB ini tidak ditemukan.");

    const isTax = poTax.isTax || 0;
    const discFakturPr = poTax.discFakturPr || 0;
    const discFaktur = payload.discFaktur != null
      ? Number(payload.discFaktur)
      : (poTax.discFaktur || 0);

    const { amount, taxAmount } = computeTotals(detail, discFakturPr, discFaktur, isTax);

    const now = new Date();
    const username = user?.username || "ADMIN";
    let actualNomor = nomor;

    if (isEdit) {
      const [[current]] = await conn.query(
        `SELECT inv_bpb_nomor, inv_isbayar FROM tinv_hdr WHERE inv_nomor = ?`,
        [actualNomor]
      );
      if (!current) throw new Error("Invoice tidak ditemukan.");
      if (current.inv_isbayar > 0) {
        throw new Error("Invoice yang sudah dibayar tidak bisa diubah.");
      }

      if (current.inv_bpb_nomor && current.inv_bpb_nomor !== bpbNomor) {
        await conn.query(
          `UPDATE tbpb_hdr SET bpb_isinvoice = 0 WHERE bpb_nomor = ?`,
          [current.inv_bpb_nomor]
        );
      }

      await conn.query(`DELETE FROM tinv_dtl WHERE invd_inv_nomor = ?`, [actualNomor]);
      
      // 👈 2. Sertakan inv_cabang pada proses UPDATE
      await conn.query(
        `UPDATE tinv_hdr SET
            inv_tanggal=?, inv_jthtempo=?, inv_bpb_nomor=?, inv_memo=?, inv_istax=?,
            inv_disc_fakturpr=?, inv_disc_faktur=?, inv_amount=?, inv_taxamount=?,
            inv_nobukti=?, inv_cabang=?, date_modified=?, user_modified=?
         WHERE inv_nomor=?`,
        [tanggal, jthtempo, bpbNomor, memo || "", isTax, discFakturPr, discFaktur,
         amount, taxAmount, nobukti || 0, activeCabang, now, username, actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `INV.${yy}${mm}.`;

      // Kunci atomik nomor invoice supaya 2 request bersamaan tidak dapat nomor sama.
      lockKey = `nomor_inv_${yy}${mm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT inv_nomor FROM tinv_hdr WHERE inv_nomor LIKE ? ORDER BY inv_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.inv_nomor) {
        nextNum = parseInt(maxRow.inv_nomor.split(".")[2], 10) + 1;
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      // ✅ FIX: FOR UPDATE mengunci baris BPB ini, supaya 2 request "buat invoice
      // dari BPB yang sama" yang datang bersamaan tidak bisa lolos cek ini
      // berdua-duanya (sebelumnya race condition -> 2 invoice untuk 1 BPB).
      const [[bpbCheck]] = await conn.query(
        `SELECT bpb_isinvoice FROM tbpb_hdr WHERE bpb_nomor = ? FOR UPDATE`, [bpbNomor]
      );
      if (!bpbCheck) throw new Error("BPB tidak ditemukan.");
      if (bpbCheck.bpb_isinvoice > 0) throw new Error("BPB ini sudah punya invoice.");

      // 👈 3. Sertakan inv_cabang pada proses INSERT
      await conn.query(
        `INSERT INTO tinv_hdr
           (inv_nomor, inv_tanggal, inv_jthtempo, inv_bpb_nomor, inv_memo, inv_istax,
            inv_disc_fakturpr, inv_disc_faktur, inv_amount, inv_taxamount,
            inv_bayar, inv_isbayar, inv_nobukti, inv_cabang,
            date_create, user_create)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
        [actualNomor, tanggal, jthtempo, bpbNomor, memo || "", isTax, discFakturPr, discFaktur,
         amount, taxAmount, nobukti || 0, activeCabang, now, username]
      );
    }

    let index = 1;
    for (const item of detail) {
      await conn.query(
        `INSERT INTO tinv_dtl
           (invd_inv_nomor, invd_brg_kode, invd_brg_satuan, invd_qty, invd_harga,
            invd_discpr, invd_nourut, invd_expired, invd_otorisasi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [actualNomor, item.brgKode, item.satuan, item.qty, item.harga,
         item.discPr || 0, index, item.expired || "0000-00-00"]
      );
      index++;
    }

    await conn.query(
      `UPDATE tbpb_hdr SET bpb_isinvoice = 1 WHERE bpb_nomor = ?`,
      [bpbNomor]
    );

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

module.exports = { getBpbOptions, getBpbDetail, getDetailForm, saveData };