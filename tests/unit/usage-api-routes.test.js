import { describe, expect, it, vi } from "vitest";

const getUserContext = vi.fn();
const getUsageStats = vi.fn(async (_period, filter) => ({ filter }));
const getChartData = vi.fn(async (_period, filter) => ({ data: [], filter }));
const getRequestDetails = vi.fn(async (filter) => ({ details: [], pagination: {}, filter }));

vi.mock("@/lib/auth/userContext", () => ({ getUserContext }));
vi.mock("@/lib/usageDb", () => ({
  getUsageStats,
  getChartData,
  getRequestDetails,
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
}));

const routes = [
  {
    name: "stats",
    load: () => import("../../src/app/api/usage/stats/route.js"),
    call: () => getUsageStats,
  },
  {
    name: "chart",
    load: () => import("../../src/app/api/usage/chart/route.js"),
    call: () => getChartData,
  },
  {
    name: "request-details",
    load: () => import("../../src/app/api/usage/request-details/route.js"),
    call: () => getRequestDetails,
  },
];

function request(query = "") {
  return new Request(`http://localhost/api/usage${query}`);
}

describe("Usage API Routes RBAC & Query Params", () => {
  for (const route of routes) {
    it(`${route.name} allows admin to filter by specific userId`, async () => {
      getUserContext.mockResolvedValue({ userId: "admin-1", isAdmin: true });
      route.call().mockClear();
      const { GET } = await route.load();

      await GET(request(`/${route.name}?userId=user-2`));

      const args = route.call().mock.calls.at(-1);
      expect(args[route.name === "request-details" ? 0 : 1]).toEqual(
        expect.objectContaining({ userId: "user-2" }),
      );
    });

    it(`${route.name} allows admin to filter unassigned records`, async () => {
      getUserContext.mockResolvedValue({ userId: "admin-1", isAdmin: true });
      route.call().mockClear();
      const { GET } = await route.load();

      await GET(request(`/${route.name}?userId=unassigned`));

      const args = route.call().mock.calls.at(-1);
      expect(args[route.name === "request-details" ? 0 : 1]).toEqual(
        expect.objectContaining({ userId: "unassigned" }),
      );
    });

    it(`${route.name} forces non-admin to filter only by self userId`, async () => {
      getUserContext.mockResolvedValue({ userId: "user-1", isAdmin: false });
      route.call().mockClear();
      const { GET } = await route.load();

      await GET(request(`/${route.name}?userId=user-2`));

      const args = route.call().mock.calls.at(-1);
      const filter = args[route.name === "request-details" ? 0 : 1];
      expect(filter).toEqual(expect.objectContaining({ userId: "user-1" }));
      expect(filter.userId).not.toBe("user-2");
    });
  }
});
