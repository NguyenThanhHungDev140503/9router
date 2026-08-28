const { getUserContext, requireAdmin } = require("./src/lib/auth/userContext.js");
(async () => {
  try {
    requireAdmin(null);
  } catch (e) {
    console.log("ERR STATUS:", e.status, "ERR MSG:", e.message);
  }
})();
