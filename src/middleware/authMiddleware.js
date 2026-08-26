const jwt = require("jsonwebtoken");
const db = require("../config/database");

/**
 * verifyToken
 * Memvalidasi JWT dari header Authorization: Bearer <token>
 * Menyimpan payload ke req.user
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Token tidak ditemukan." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { kode, nama, cabang, level, ... }
    next();
  } catch (err) {
    return res
      .status(403)
      .json({
        success: false,
        message: "Token tidak valid atau sudah expired.",
      });
  }
};

/**
 * checkPermission(menuId, action)
 * action: 'view' | 'insert' | 'edit' | 'delete' | 'print'
 *
 * Sesuaikan query dengan tabel hak akses di DB Finance Anda.
 * Contoh ini menggunakan tabel tuser_menu yang sama seperti garmen.
 */
const checkPermission = (menuId, action) => {
  return async (req, res, next) => {
    try {
      if (req.user?.kode?.toUpperCase() === "ADMIN") return next();

      const colMap = {
        view: "hak_men_view",
        insert: "hak_men_insert",
        edit: "hak_men_edit",
        delete: "hak_men_delete",
      };
      const col = colMap[action];
      if (!col)
        return res
          .status(400)
          .json({ success: false, message: "Action tidak valid." });

      const [rows] = await db.query(
        `SELECT ${col} AS permission FROM thakuser 
         WHERE hak_user_kode = ? AND hak_men_id = ? LIMIT 1`,
        [req.user.kode, menuId],
      );

      if (rows.length === 0 || rows[0].permission !== "Y")
        return res
          .status(403)
          .json({ success: false, message: "Akses ditolak." });

      next();
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, message: "Gagal memeriksa hak akses." });
    }
  };
};

module.exports = { verifyToken, checkPermission };
