export default {
  id: "linkup",
  alias: "linkup",
  display: {
    name: "Linkup",
    authType: "official_api",
    icon: "link",
    color: "#0EA5E9",
    textIcon: "LK",
    website: "https://linkup.so",
    notice: {
      apiKeyUrl: "https://app.linkup.so/api-keys"
    }
  },
  category: "apikey",
  serviceKinds: [
    "webSearch"
  ],
  searchConfig: {
    baseUrl: "https://api.linkup.so/v1/search",
    method: "POST",
    authHeader: "bearer",
    costPerQuery: 0.005,
    freeMonthlyQuota: 1000,
    searchTypes: [
      "web"
    ],
    defaultMaxResults: 5,
    maxMaxResults: 50,
    timeoutMs: 10000,
    cacheTTLMs: 300000
  }
};
