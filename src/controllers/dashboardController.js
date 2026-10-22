const svc = require("../services/dashboardService");

const getSummary = async (req, res) => {
  try {
    // Ambil cabang dari token user yang login
    const cabang = req.user?.cabang || "ALL";

    const data = await svc.getSummary(cabang);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getSales = async (req, res) => {
  try {
    const data = await svc.getSales(req.user, req.query.cabang);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getSummary, getSales };
