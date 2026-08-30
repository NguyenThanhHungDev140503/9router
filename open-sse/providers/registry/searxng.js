import { SEARXNG_URL } from "../../config/runtimeConfig.js";

export default {
  id: "searxng",
  alias: "searxng",
  display: {
    name: "SearXNG",
    authType: "official_api",
    icon: "saved_search",
    color: "#3B82F6",
    textIcon: "SX",
    website: "https://docs.searxng.org"
  },
  category: "freeTier",
  serviceKinds: [
    "webSearch"
  ],
  noAuth: true,
  searchConfig: {
    baseUrl: SEARXNG_URL,
    method: "GET",
    authHeader: "none",
    costPerQuery: 0,
    freeMonthlyQuota: 999999,
    searchTypes: [
      "web",
      "news"
    ],
    defaultMaxResults: 5,
    maxMaxResults: 50,
    timeoutMs: 10000,
    cacheTTLMs: 180000
  }
};
