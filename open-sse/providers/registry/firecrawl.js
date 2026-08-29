export default {
  id: "firecrawl",
  alias: "firecrawl",
  display: {
    name: "Firecrawl",
    authType: "official_api",
    icon: "local_fire_department",
    color: "#F59E0B",
    textIcon: "FC",
    website: "https://firecrawl.dev",
    notice: {
      apiKeyUrl: "https://www.firecrawl.dev/app/api-keys"
    }
  },
  category: "apikey",
  serviceKinds: [
    "webFetch"
  ],
  fetchConfig: {
    baseUrl: "https://api.firecrawl.dev/v1/scrape",
    method: "POST",
    authHeader: "bearer",
    costPerQuery: 0.002,
    freeMonthlyQuota: 500,
    formats: [
      "markdown",
      "html",
      "text"
    ],
    maxCharacters: 200000,
    timeoutMs: 30000
  }
};
