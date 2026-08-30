import { createHash, randomUUID } from "node:crypto";

export const MAX_GEMINI_FUNCTION_NAME_LENGTH = 64;

export class ToolLedger {
  constructor() {
    this.originalToProvider = new Map();
    this.providerToOriginal = new Map();
    this.toolMeta = new Map();
    this.calls = new Map();
  }

  registerTool(originalName, options = {}) {
    if (!originalName || typeof originalName !== "string") return "_unknown";
    if (this.originalToProvider.has(originalName)) {
      return this.originalToProvider.get(originalName);
    }

    const { isCustom = false, kind = "function", description = "", parameters = null } = options;

    let clean = originalName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!/^[a-zA-Z_]/.test(clean)) {
      clean = "_" + clean;
    }

    let finalName = clean;
    if (finalName.length > MAX_GEMINI_FUNCTION_NAME_LENGTH || this.providerToOriginal.has(finalName)) {
      const fullHash = createHash("sha256").update(originalName).digest("hex");
      let found = false;
      for (
        let hashLength = 8;
        hashLength <= Math.min(fullHash.length, MAX_GEMINI_FUNCTION_NAME_LENGTH - 2);
        hashLength += 4
      ) {
        const hashSlice = fullHash.slice(0, hashLength);
        const maxPrefixLen = Math.max(1, MAX_GEMINI_FUNCTION_NAME_LENGTH - (hashSlice.length + 1));
        const prefix = clean.slice(0, maxPrefixLen);
        const candidate = `${prefix}_${hashSlice}`;
        if (!this.providerToOriginal.has(candidate) || this.providerToOriginal.get(candidate) === originalName) {
          finalName = candidate;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let attempt = 1; attempt < 999; attempt++) {
          const suffix = `_${attempt}`;
          const hashSlice = fullHash.slice(0, MAX_GEMINI_FUNCTION_NAME_LENGTH - suffix.length - 2);
          const maxPrefixLen = Math.max(1, MAX_GEMINI_FUNCTION_NAME_LENGTH - hashSlice.length - suffix.length - 1);
          const prefix = clean.slice(0, maxPrefixLen);
          const candidate = `${prefix}_${hashSlice}${suffix}`;
          if (!this.providerToOriginal.has(candidate) || this.providerToOriginal.get(candidate) === originalName) {
            finalName = candidate;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        throw new Error(`Unable to allocate provider name for ${originalName}`);
      }
    }

    this.originalToProvider.set(originalName, finalName);
    this.providerToOriginal.set(finalName, originalName);
    this.toolMeta.set(originalName, { isCustom, kind, description, parameters });
    return finalName;
  }

  getProviderName(originalName) {
    if (!this.originalToProvider.has(originalName)) {
      return this.registerTool(originalName);
    }
    return this.originalToProvider.get(originalName);
  }

  getOriginalName(providerName) {
    return this.providerToOriginal.get(providerName) || providerName;
  }

  isCustom(nameOrProviderName) {
    const original = this.providerToOriginal.get(nameOrProviderName) || nameOrProviderName;
    return Boolean(this.toolMeta.get(original)?.isCustom);
  }

  registerCall({ callId, providerName, originalName, isError = false }) {
    this.calls.set(callId, { providerName, originalName, isError });
  }

  getCall(callId) {
    return this.calls.get(callId);
  }

  generateFallbackCallId() {
    return `call_${randomUUID().replace(/-/g, "")}`;
  }
}
