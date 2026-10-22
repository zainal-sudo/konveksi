const jwt = require('jsonwebtoken');
require('dotenv').config();

const payload = { kode: 'ADMIN', nama: 'Admin Test', level: 'USER', cabang: '00' };
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

const BASE = 'http://localhost:3199';

async function tryGet(label, url) {
  try {
    const res = await fetch(BASE + url, { headers: { Authorization: 'Bearer ' + token } });
    const body = await res.text();
    console.log(label, '->', res.status, body.slice(0, 250));
  } catch (e) {
    console.log(label, '-> ERROR', e.message);
  }
}

(async () => {
  await tryGet('PL get-max-nomor', '/api/accounting/pembayaran-lain/form/get-max-nomor?tanggal=2026-10-22&cabang=00&tipe=Pembayaran%20Lain');
  await tryGet('PNL get-max-nomor', '/api/accounting/penerimaan-lain/form/get-max-nomor?tanggal=2026-10-22&cabang=00&tipe=Penerimaan%20Lain');
  await tryGet('PL search-account', '/api/accounting/pembayaran-lain/form/search-account?cari=KAS');
  await tryGet('PL cost-center', '/api/accounting/pembayaran-lain/form/cost-center');
  await tryGet('PL cek-periode', '/api/accounting/pembayaran-lain/form/cek-periode?tanggal=2026-10-22');
  await tryGet('JU account-all', '/api/accounting/jurnal-umum/form/account-all');
  await tryGet('JU cost-center', '/api/accounting/jurnal-umum/form/cost-center');
})();
