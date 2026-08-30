const { EventEmitter } = require("events");
const { validateUrlSecurity } = require("./security");
const { McpError, McpTransportClosedError } = require("./errors");

class SseTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    this.url = options.url;
    this.headers = options.headers || {};
    this.allowPrivateIps = options.allowPrivateIps ?? false;
    this.postUrl = null;
    this.closed = false;
    this.abortController = null;
  }

  async start() {
    if (this.closed) return;
    
    validateUrlSecurity(this.url, { allowPrivateIps: this.allowPrivateIps });

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const headers = {
      Accept: "text/event-stream",
      ...this.headers,
    };

    try {
      const response = await fetch(this.url, {
        method: "GET",
        headers,
        signal,
      });

      if (!response.ok) {
        throw new McpError("Failed to connect to SSE stream: HTTP " + response.status, "MCP_SSE_CONNECT_FAILED");
      }

      if (!response.body) {
        throw new McpError("No response body received from SSE stream", "MCP_SSE_EMPTY_BODY");
      }

      this._readStream(response.body).catch((err) => {
        if (!this.closed) {
          this.emit("error", err);
          this._handleClose();
        }
      });
    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      throw new McpError("SSE connection error: " + err.message, "MCP_SSE_ERROR", err);
    }
  }

  async _readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop(); // keep remainder

        let currentEvent = null;
        let currentData = "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            // End of SSE event
            if (currentEvent === "endpoint" && currentData) {
              // Endpoint event gives the POST URL
              try {
                this.postUrl = new URL(currentData, this.url).toString();
                this.emit("endpoint", this.postUrl);
              } catch (e) {
                this.postUrl = currentData;
                this.emit("endpoint", this.postUrl);
              }
            } else if (currentEvent === "message" || (!currentEvent && currentData)) {
              try {
                const parsed = JSON.parse(currentData);
                this.emit("message", parsed);
              } catch (e) {
                // Ignore parse errors or non-json message
              }
            }
            currentEvent = null;
            currentData = "";
            continue;
          }

          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            const dataPart = trimmed.slice(5).trim();
            currentData = currentData ? currentData + "\n" + dataPart : dataPart;
          }
        }
      }
    } finally {
      this._handleClose();
    }
  }

  async send(message) {
    if (this.closed) {
      throw new McpTransportClosedError("Cannot send message: SSE transport is closed");
    }

    const postEndpoint = this.postUrl || this.url;
    validateUrlSecurity(postEndpoint, { allowPrivateIps: this.allowPrivateIps });

    const headers = {
      "Content-Type": "application/json",
      ...this.headers,
    };

    const res = await fetch(postEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new McpError("HTTP error sending MCP message: " + res.status + " " + errText, "MCP_HTTP_ERROR");
    }

    // In HTTP streaming mode, POST may return direct JSON-RPC response
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => null);
      if (body) {
        this.emit("message", body);
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
  SseTransport,
};
