import { describe, it, expect, beforeEach, vi } from "vitest";
import { getUserContext, requireUserContext } from "../../../src/lib/auth/userContext.js";
import { getDashboardAuthSession } from "../../../src/lib/auth/dashboardSession.js";
import { hasTrustedPeerHeaders } from "../../../src/lib/auth/trustedPeer.js";

vi.mock("../../../src/lib/auth/dashboardSession.js", () => ({
  getDashboardAuthSession: vi.fn(),
}));

vi.mock("../../../src/lib/auth/trustedPeer.js", () => ({
  hasTrustedPeerHeaders: vi.fn(),
}));

describe("userContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts authenticated user from valid dashboard cookie", async () => {
    getDashboardAuthSession.mockResolvedValue({ id: 42, role: "admin", username: "alice" });

    const req = new Request("http://localhost/api/mcp/servers", {
      headers: {
        cookie: "auth_token=valid_token",
      },
    });

    const ctx = await getUserContext(req);
    expect(ctx).toEqual({
      userId: 42,
      isAdmin: true,
      role: "admin",
      username: "alice",
      authSource: "cookie",
    });
  });

  it("extracts non-admin authenticated user", async () => {
    getDashboardAuthSession.mockResolvedValue({ id: 10, role: "user", username: "bob" });

    const req = new Request("http://localhost/api/skills", {
      headers: {
        cookie: "auth_token=user_token",
      },
    });

    const ctx = await getUserContext(req);
    expect(ctx).toEqual({
      userId: 10,
      isAdmin: false,
      role: "user",
      username: "bob",
      authSource: "cookie",
    });
  });

  it("ignores untrusted x-user-id / x-user-role headers without peer token", async () => {
    hasTrustedPeerHeaders.mockReturnValue(false);
    getDashboardAuthSession.mockResolvedValue(null);

    const req = new Request("http://localhost/api/mcp/servers", {
      headers: {
        "x-user-id": "999",
        "x-user-role": "admin",
        "x-user-name": "hacker",
      },
    });

    const ctx = await getUserContext(req);
    expect(ctx).toEqual({
      userId: null,
      isAdmin: false,
      role: "anonymous",
      username: null,
      authSource: "anonymous",
    });
  });

  it("accepts x-user-id / x-user-role only when trusted peer token is valid", async () => {
    hasTrustedPeerHeaders.mockReturnValue(true);

    const req = new Request("http://localhost/api/mcp/servers", {
      headers: {
        "x-user-id": "123",
        "x-user-role": "admin",
        "x-user-name": "internal-service",
        "x-9r-peer-token": "valid-token",
      },
    });

    const ctx = await getUserContext(req);
    expect(ctx).toEqual({
      userId: 123,
      isAdmin: true,
      role: "admin",
      username: "internal-service",
      authSource: "peer_header",
    });
  });

  it("requireUserContext throws 401 when anonymous", async () => {
    getDashboardAuthSession.mockResolvedValue(null);
    hasTrustedPeerHeaders.mockReturnValue(false);

    const req = new Request("http://localhost/api/skills");
    await expect(requireUserContext(req)).rejects.toMatchObject({
      status: 401,
      message: expect.stringMatching(/Unauthorized/i),
    });
  });
});
