export default {
  id: "exa",
  alias: "exa",
  display: {
    name: "Exa",
    authType: "official_api",
    icon: "manage_search",
    color: "#2563EB",
    textIcon: "EX",
    website: "https://exa.ai",
    notice: {
      apiKeyUrl: "https://dashboard.exa.ai/api-keys"
    }
  },
  category: "apikey",
  serviceKinds: [
    "webSearch",
    "webFetch"
  ],
  searchConfig: {
    baseUrl: "https://api.exa.ai/search",
    method: "POST",
    authHeader: "x-api-key",
    costPerQuery: 0.007,
    freeMonthlyQuota: 1000,
    searchTypes: [
      "web",
      "news"
    ],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 10000,
    cacheTTLMs: 300000
  },
  fetchConfig: {
    baseUrl: "https://api.exa.ai/contents",
    method: "POST",
    authHeader: "x-api-key",
    costPerQuery: 0.001,
    freeMonthlyQuota: 1000,
    formats: [
      "text",
      "markdown"
    ],
    maxCharacters: 100000,
    timeoutMs: 15000
  }
};
