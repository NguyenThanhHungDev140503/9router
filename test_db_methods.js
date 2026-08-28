const { getProviderConnections } = require("./src/models/index.js");
(async () => {
  try {
    const res = await getProviderConnections({});
    console.log("PC RES:", res.length);
  } catch(e) {
    console.error("PC ERR:", e);
  }
})();
