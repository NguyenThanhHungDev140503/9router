import { getDashboardAuthSession } from "./dashboardSession.js";
import { hasTrustedPeerHeaders } from "./trustedPeer.js";

/**
 * Normalizes user context across dashboard cookie session and trusted peer headers.
 * Untrusted headers without valid peer token are strictly ignored.
 *
 * @param {Request} request
 * @returns {Promise<{ userId: string|number|null, isAdmin: boolean, role: string, username: string|null, authSource: string }>}
 */
export async function getUserContext(request) {
  // 1. Check dashboard session cookie first
  let token = null;
  const cookieHeader = request?.headers?.get?.("cookie") || "";
  if (cookieHeader) {
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  if (token) {
    const session = await getDashboardAuthSession(token);
    if (session) {
      const role = session.role || "admin";
      return {
        userId: session.id !== undefined && session.id !== null ? session.id : 1,
        isAdmin: role === "admin",
        role,
        username: session.username || "admin",
        authSource: "cookie",
      };
    }
  }

  // 2. Only trust x-user-* headers if authenticated via peer secret token
  if (hasTrustedPeerHeaders(request)) {
    const headerUserId = request.headers.get("x-user-id");
    const headerRole = request.headers.get("x-user-role");
    const headerUsername = request.headers.get("x-user-name");

    if (headerUserId || headerRole) {
      const role = headerRole || "user";
      const parsedUserId = Number.isNaN(Number(headerUserId)) ? headerUserId : Number(headerUserId);
      return {
        userId: parsedUserId ?? 1,
        isAdmin: role === "admin",
        role,
        username: headerUsername || "user",
        authSource: "peer_header",
      };
    }
  }

  // 3. Anonymous fallback
  return {
    userId: null,
    isAdmin: false,
    role: "anonymous",
    username: null,
    authSource: "anonymous",
  };
}

/**
 * Enforces authenticated user context. Throws error with status 401 if anonymous.
 *
 * @param {Request} request
 * @returns {Promise<{ userId: string|number, isAdmin: boolean, role: string, username: string, authSource: string }>}
 */
export async function requireUserContext(request) {
  const user = await getUserContext(request);
  if (!user.userId || user.role === "anonymous") {
    const error = new Error("Unauthorized: Authentication required");
    error.status = 401;
    throw error;
  }
  return user;
}
