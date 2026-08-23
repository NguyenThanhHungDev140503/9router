export class UnsupportedHostedToolError extends Error {
  constructor(toolType) {
    super(`Hosted tool "${toolType || "unknown"}" is not supported by Gemini`);
    this.name = "UnsupportedHostedToolError";
    this.status = 400;
  }
}
