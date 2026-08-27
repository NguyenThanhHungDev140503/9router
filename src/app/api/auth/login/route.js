import { NextResponse } from "next/server";
import { getSettings, validateUserCredentials, getUsers, getUserByUsername } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import { isOidcConfigured } from "@/lib/auth/oidc";
import { isSamlConfigured } from "@/lib/auth/saml.js";
import { checkLock, recordFail, recordSuccess, getClientIp } from "@/lib/auth/loginLimiter";
import { isLocalRequest } from "@/dashboardGuard";

const RESET_HINT = "Forgot password? Reset to default via 9Router CLI → Settings → Reset Password to Default.";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function isTunnelRequest(request, settings) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const tunnelHost = settings.tunnelUrl ? new URL(settings.tunnelUrl).hostname.toLowerCase() : "";
  const tailscaleHost = settings.tailscaleUrl ? new URL(settings.tailscaleUrl).hostname.toLowerCase() : "";
  return (tunnelHost && host === tunnelHost) || (tailscaleHost && host === tailscaleHost);
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const lock = checkLock(ip);
    if (lock.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${lock.retryAfter}s. ${RESET_HINT}`, retryAfter: lock.retryAfter, resetHint: RESET_HINT },
        { status: 429, headers: { "Retry-After": String(lock.retryAfter) } }
      );
    }

    const body = await request.json();
    const { password } = body;
    const username = body.username ? String(body.username).trim() : null;
    const settings = await getSettings();

    // Block login via tunnel/tailscale if dashboard access is disabled
    if (isTunnelRequest(request, settings) && settings.tunnelDashboardAccess !== true) {
      return NextResponse.json({ error: "Dashboard access via tunnel is disabled" }, { status: 403 });
    }

    if (settings.authMode === "sso" || settings.authMode === "saml" || settings.authMode === "oidc") {
      const ssoType = settings.ssoType || (settings.authMode === "saml" ? "saml" : "oidc");
      if (ssoType === "saml" && isSamlConfigured(settings)) {
        return NextResponse.json({ error: "Password login is disabled. Use SAML SSO sign in." }, { status: 403 });
      }
      if (ssoType === "oidc" && isOidcConfigured(settings)) {
        return NextResponse.json({ error: "Password login is disabled. Use OIDC sign in." }, { status: 403 });
      }
    }

    let authenticatedUser = null;

    if (username) {
      authenticatedUser = await validateUserCredentials(username, password);
    } else {
      // Try admin user in users table first
      authenticatedUser = await validateUserCredentials("admin", password);

      // Fallback check against legacy settings or initial password
      if (!authenticatedUser) {
        const storedHash = settings.password;
        let isValid = false;
        if (storedHash) {
          isValid = await bcrypt.compare(password, storedHash);
        } else {
          const initialPassword = process.env.INITIAL_PASSWORD || "123456";
          isValid = password === initialPassword;
        }

        if (isValid) {
          const admins = await getUsers({ role: "admin", isActive: true });
          if (admins && admins.length > 0) {
            authenticatedUser = admins[0];
          } else {
            authenticatedUser = { id: "admin", username: "admin", role: "admin" };
          }
        }
      }
    }

    if (authenticatedUser) {
      recordSuccess(ip);

      const storedHash = settings.password;
      const mustChangePassword =
        !storedHash && !process.env.INITIAL_PASSWORD && !isLocalRequest(request) && authenticatedUser.role === "admin";

      if (mustChangePassword) {
        return NextResponse.json(
          { success: false, error: "Default password must be changed before remote access. Change it from the local machine (or set INITIAL_PASSWORD).", mustChangePassword },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const cookieStore = await cookies();
      await setDashboardAuthCookie(cookieStore, request, {
        userId: authenticatedUser.id,
        username: authenticatedUser.username,
        role: authenticatedUser.role,
      });

      return NextResponse.json({
        success: true,
        mustChangePassword: false,
        user: {
          id: authenticatedUser.id,
          username: authenticatedUser.username,
          role: authenticatedUser.role,
        },
      }, { headers: NO_STORE_HEADERS });
    }

    const { remainingBeforeLock } = recordFail(ip);
    const postLock = checkLock(ip);
    if (postLock.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${postLock.retryAfter}s. ${RESET_HINT}`, retryAfter: postLock.retryAfter, resetHint: RESET_HINT },
        { status: 429, headers: { "Retry-After": String(postLock.retryAfter) } }
      );
    }
    return NextResponse.json(
      { error: `Invalid credentials. ${remainingBeforeLock} attempt(s) left before lockout.`, remainingBeforeLock },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
