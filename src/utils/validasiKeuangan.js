// ── Validasi nilai finansial form (SO/FP) ───────────────────────────────
// Diskonto(%) harus 0–100; nilai nominal (Rp) serta biaya/freight tidak boleh
// negatif. Values dijamin NUMBER kosong → 0 supaya konsisten dgn pemakaian
// `|| 0` di kode simpan.
const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Diskonto / komponen lain yang bersifat persen (0–100%).
const validasiPersen = (label, v) => {
  const n = toNumber(v);
  if (n < 0 || n > 100) {
    throw new Error(`${label} harus antara 0 sampai 100%.`);
  }
  return n;
};

// Nilai nominal (Rp) — tidak boleh negatif.
const validasiNonNegatif = (label, v) => {
  const n = toNumber(v);
  if (n < 0) {
    throw new Error(`${label} tidak boleh negatif.`);
  }
  return n;
};

// ── Diskon faktur gabungan (SO/FP) ─────────────────────────────────────
// Rumus simpan: disc = round(bruto × discFakturPr/100) + discFaktur(Rp).
// Persen sudah dibatasi 0–100, TAPI persen & nominal bisa saling TUMPUK
// (mis. 100% + Rp 15.500) sehingga total diskon melebihi bruto → nilai
// dokumen jadi negatif. Helper ini menolaknya lebih awal (toleransi 1
// rupiah untuk pembulatan).
const validasiDiskonFaktur = (bruto, discFakturPr, discFaktur) => {
  const b = toNumber(bruto);
  const total = Math.round((b * toNumber(discFakturPr)) / 100) + toNumber(discFaktur);
  if (b >= 0 && total > b + 1) {
    throw new Error(
      "Diskon Faktur (%) + Diskon Faktur (Rp) melebihi nilai bruto — total diskon tidak boleh lebih dari 100%.",
    );
  }
};

// ── Validasi tanggal (YYYY-MM-DD) ─────────────────────────────────────
// Menolak tanggal palsu (mis. PO.2100 bukan masalah, tapi '2026-02-31'
// atau '28/12/2026' atau 'abc' ditolak) supaya prefix nomor yang digenerate
// dari `new Date(tanggal)` tidak jadi "NaN" dan header yatim tidak tercipta.
const isValidTanggal = (v) => {
  if (typeof v !== "string") return false;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (yy < 1900 || yy > 2200 || mm < 1 || mm > 12 || dd < 1) return false;
  const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return dd <= dim;
};

const validasiTanggal = (label, v) => {
  if (!isValidTanggal(v)) {
    throw new Error(`${label} tidak valid (format YYYY-MM-DD).`);
  }
  return v;
};

module.exports = { toNumber, validasiPersen, validasiNonNegatif, validasiDiskonFaktur, isValidTanggal, validasiTanggal };