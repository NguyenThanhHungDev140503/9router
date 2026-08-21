export class BaseFormatInjector {
  constructor({ normalizeCandidates, getClientToolNames } = {}) {
    this.normalizeCandidates = normalizeCandidates;
    this.getClientToolNames = getClientToolNames;
  }

  inject(body, cachedTools) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    if (!Array.isArray(cachedTools) || cachedTools.length === 0) return body;

    const existingTools = Array.isArray(body.tools) ? body.tools : [];
    const clientToolNames = this.getClientToolNames(existingTools);
    const candidates = this.normalizeCandidates(cachedTools, clientToolNames);
    if (candidates.length === 0) return body;

    const injectedTools = candidates
      .map((candidate) => this.formatTool(candidate))
      .filter(Boolean);
    if (injectedTools.length === 0) return body;

    return {
      ...body,
      tools: [...existingTools, ...injectedTools],
    };
  }

  formatTool() {
    throw new Error("BaseFormatInjector subclasses must implement formatTool");
  }
}
