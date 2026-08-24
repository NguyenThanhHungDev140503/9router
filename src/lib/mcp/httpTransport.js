const { EventEmitter } = require("events");
const { validateUrlSecurity } = require("./security");
const { McpError, McpTransportClosedError } = require("./errors");

class HttpTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    this.url = options.url;
    this.headers = options.headers || {};
    this.allowPrivateIps = options.allowPrivateIps ?? false;
    this.sessionId = options.sessionId || null;
    this.closed = false;
    this.abortController = null;
  }

  async start() {
    if (this.closed) return;
    validateUrlSecurity(this.url, { allowPrivateIps: this.allowPrivateIps });
    this.abortController = new AbortController();
  }

  async send(message) {
    if (this.closed) {
      throw new McpTransportClosedError("Cannot send message: HTTP transport is closed");
    }

    validateUrlSecurity(this.url, { allowPrivateIps: this.allowPrivateIps });

    const headers = {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      ...this.headers,
    };

    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const signal = this.abortController?.signal;

    let res;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      throw new McpError("HTTP transport request failed: " + err.message, "MCP_HTTP_ERROR", err);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new McpError(`HTTP error sending MCP message: ${res.status} ${errText}`.trim(), "MCP_HTTP_ERROR");
    }

    const returnedSessionId = res.headers.get("mcp-session-id");
    if (returnedSessionId) {
      this.sessionId = returnedSessionId;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("text/event-stream") && res.body) {
      // Process Streamable HTTP SSE payload from POST response
      await this._parseSseResponse(res.body);
    } else if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => null);
      if (body) {
        this.emit("message", body);
      }
    }
  }

  async _parseSseResponse(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        let currentData = "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            if (currentData) {
              try {
                const parsed = JSON.parse(currentData);
                this.emit("message", parsed);
              } catch (e) {
                // Ignore parse errors on malformed event
              }
            }
            currentData = "";
            continue;
          }

          if (trimmed.startsWith("data:")) {
            const dataPart = trimmed.slice(5).trim();
            currentData = currentData ? currentData + "\n" + dataPart : dataPart;
          }
        }

        if (currentData) {
          try {
            const parsed = JSON.parse(currentData);
            this.emit("message", parsed);
          } catch (e) {}
        }
      }
    } catch (err) {
      if (!this.closed && err.name !== "AbortError") {
        this.emit("error", err);
      }
    }
  }

  _handleClose() {
    if (this.closed) return;
    this.closed = true;
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (e) {}
    }
    this.emit("close");
  }

  async close() {
    this._handleClose();
  }
}

module.exports = {
  HttpTransport,
};
