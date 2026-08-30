export default {
  version: 7,
  name: "usage-user-composite-indexes",
  up(db) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_uh_user_ts ON usageHistory(userId, timestamp DESC)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_rd_user_ts ON requestDetails(userId, timestamp DESC)");
  },
};
