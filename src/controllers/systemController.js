// controllers/systemController.js
const packageJson = require("../../package.json"); // Pastikan path-nya benar
const changelogs = require("../config/changelog");

const getSystemInfo = (req, res) => {
  const version = packageJson.version;
  const currentChangelog = changelogs[version] || [
    "Tidak ada catatan rilis untuk versi ini.",
  ];

  res.json({
    success: true,
    data: {
      name: packageJson.name,
      version: version,
      changelog: currentChangelog,
      all_changelogs: changelogs,
    },
  });
};

module.exports = { getSystemInfo };
