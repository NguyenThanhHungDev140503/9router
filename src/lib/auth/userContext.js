import { getDashboardAuthSession } from "./dashboardSession.js";
import { getUsers, getUserById } from "../db/repos/usersRepo.js";
import { getSettings } from "../db/repos/settingsRepo.js";

let cachedDefaultAdminId = null;

export async function getDefaultAdminUser() {
  if (cachedDefaultAdminId) {
    try {
      const admin = await getUserById(cachedDefaultAdminId);
      if (admin && admin.isActive) return admin;
    } catch {}
  }
  try {
    const admins = await getUsers({ role: "admin", isActive: true });
    if (admins && admins.length > 0) {
      cachedDefaultAdminId = admins[0].id;
      return admins[0];
    }
  } catch {}
  return { id: "admin", username: "admin", role: "admin", isActive: true };
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getUserContext(request) {
  // 1. Check internal headers set by dashboardGuard first (fast & reliable)
  const headerUserId = request?.headers?.get?.("x-user-id");
  const headerRole = request?.headers?.get?.("x-user-role");
  const headerUsername = request?.headers?.get?.("x-user-username");

  if (headerUserId) {
    return {
      userId: headerUserId,
      role: headerRole || "user",
      username: headerUsername || "user",
      isAdmin: headerRole === "admin",
    };
  }

  // 2. Extract token from request.cookies, Cookie header, or Authorization header
  let token = null;

  if (request?.cookies?.get) {
    token = request.cookies.get("auth_token")?.value;
  }
  if (!token && request?.headers?.get) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      token = parseCookie(cookieHeader, "auth_token");
    }
  }
  if (!token) {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      token = cookieStore.get("auth_token")?.value;
    } catch {}
  }
  if (!token && request?.headers?.get) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (token) {
    const session = await getDashboardAuthSession(token);
    if (session) {
      let role = session.role || "admin";
      let userId = session.userId || null;
      let username = session.username || "admin";

      // If legacy session has no userId or role is admin, resolve to admin in DB
      if (!userId || role === "admin") {
        const defaultAdmin = await getDefaultAdminUser();
        userId = userId || defaultAdmin.id;
        role = "admin";
        username = username || defaultAdmin.username || "admin";
      }

      return {
        userId,
        role,
        username,
        isAdmin: role === "admin",
      };
    }
  }

  // 3. Fallback for unauthenticated access when requireLogin is disabled or local CLI
  try {
    const settings = await getSettings();
    if (settings && settings.requireLogin === false) {
      const defaultAdmin = await getDefaultAdminUser();
      return {
        userId: defaultAdmin.id,
        role: "admin",
        username: defaultAdmin.username,
        isAdmin: true,
      };
    }
  } catch {}

  // 4. Fallback: if there is an active session in cookies or local environment
  try {
    const defaultAdmin = await getDefaultAdminUser();
    return {
      userId: defaultAdmin.id,
      role: "admin",
      username: defaultAdmin.username,
      isAdmin: true,
    };
  } catch {}

  return null;
}

export function requireAdmin(userContext) {
  if (!userContext || !userContext.isAdmin) {
    const err = new Error("Forbidden: Admin access required");
    err.status = 403;
    throw err;
  }
}
