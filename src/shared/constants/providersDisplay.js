// UI display config — all providers derive from registry.display.
import REGISTRY from "open-sse/providers/registry/index.js";

export const AUTH_TYPES = {
  OFFICIAL_API: "official_api",
  PERSONAL_SUBSCRIPTION: "personal_subscription",
};

export const BYOC_GUIDE_NOTICE = {
  badge: "Personal Subscription (BYOC)",
  title: "Personal Subscription Account",
  description: "Connected using your personal subscription credentials. Best used for private routing. Sharing across multiple concurrent users may impact account rate limits.",
};

const resolveDisplay = (d) => {
  const display = { ...d };
  if (!display.authType) {
    display.authType = AUTH_TYPES.OFFICIAL_API;
  }
  return display;
};

export const PROVIDER_DISPLAY = Object.fromEntries(
  REGISTRY.filter((r) => r.display).map((r) => [r.id, resolveDisplay(r.display)]),
);
