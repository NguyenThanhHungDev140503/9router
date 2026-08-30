class McpError extends Error {
  constructor(message, code = "MCP_ERROR", details = null) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.details = details;
  }
}

class McpTimeoutError extends McpError {
  constructor(message = "MCP request timed out", details = null) {
    super(message, "MCP_TIMEOUT", details);
    this.name = "McpTimeoutError";
  }
}

class McpProtocolError extends McpError {
  constructor(message = "MCP protocol violation", details = null) {
    super(message, "MCP_PROTOCOL_ERROR", details);
    this.name = "McpProtocolError";
  }
}

class McpTransportClosedError extends McpError {
  constructor(message = "MCP transport closed unexpectedly", details = null) {
    super(message, "MCP_TRANSPORT_CLOSED", details);
    this.name = "McpTransportClosedError";
  }
}

module.exports = {
  McpError,
  McpTimeoutError,
  McpProtocolError,
  McpTransportClosedError,
};
