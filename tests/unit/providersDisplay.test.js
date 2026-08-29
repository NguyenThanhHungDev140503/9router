import { describe, it, expect } from "vitest";
import { PROVIDER_DISPLAY, AUTH_TYPES, BYOC_GUIDE_NOTICE } from "../../src/shared/constants/providersDisplay.js";

describe("providersDisplay constants", () => {
  it("exports AUTH_TYPES and BYOC_GUIDE_NOTICE", () => {
    expect(AUTH_TYPES.OFFICIAL_API).toBe("official_api");
    expect(AUTH_TYPES.PERSONAL_SUBSCRIPTION).toBe("personal_subscription");
    expect(BYOC_GUIDE_NOTICE.badge).toContain("Personal Subscription");
  });

  it("does not expose RISK_NOTICE for subscription providers", () => {
    expect(PROVIDER_DISPLAY.codex?.deprecationNotice).toBeUndefined();
    expect(PROVIDER_DISPLAY.claude?.deprecationNotice).toBeUndefined();
    expect(PROVIDER_DISPLAY.codex?.authType).toBe("personal_subscription");
  });
});
