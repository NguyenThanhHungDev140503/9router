const { randomUUID } = require('crypto');
const { EventEmitter } = require('events');
const {
  McpError,
  McpTimeoutError,
  McpProtocolError,
  McpTransportClosedError,
} = require('./errors');

const DEFAULT_TIMEOUT_MS = 30000;
const LATEST_PROTOCOL_VERSION = '2024-11-05';
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2024-11-05',
  '2024-10-07',
];

class McpClient extends EventEmitter {
  constructor(transport, options = {}) {
    super();
    this.transport = transport;
    this.options = options;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.pendingRequests = new Map();
    this.serverCapabilities = null;
    this.serverInfo = null;
    this.protocolVersion = null;
    this.initialized = false;
    this.closed = false;

    this._onTransportMessage = this._handleMessage.bind(this);
    this._onTransportClose = this._handleTransportClose.bind(this);
    this._onTransportError = this._handleTransportError.bind(this);

    if (this.transport) {
      if (typeof this.transport.on === 'function') {
        this.transport.on('message', this._onTransportMessage);
        this.transport.on('close', this._onTransportClose);
        this.transport.on('error', this._onTransportError);
      }
    }
  }

  async initialize(clientInfo = { name: '9router', version: '1.0.0' }, capabilities = {}) {
    if (this.initialized) {
      return {
        protocolVersion: this.protocolVersion,
        capabilities: this.serverCapabilities,
        serverInfo: this.serverInfo,
      };
    }

    const response = await this.request('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
        ...capabilities,
      },
      clientInfo,
    });

    if (!response || typeof response !== 'object') {
      throw new McpProtocolError('Invalid initialize response from MCP server');
    }

    this.protocolVersion = response.protocolVersion || LATEST_PROTOCOL_VERSION;
    this.serverCapabilities = response.capabilities || {};
    this.serverInfo = response.serverInfo || {};
    this.initialized = true;

    await this.notify('notifications/initialized', {});

    return response;
  }

  async listTools(cursor = undefined) {
    this._ensureInitialized();
    const params = cursor ? { cursor } : {};
    return await this.request('tools/list', params);
  }

  async callTool(name, args = {}, meta = {}) {
    this._ensureInitialized();
    if (!name || typeof name !== 'string') {
      throw new McpProtocolError('Tool name is required and must be a string');
    }
    const params = {
      name,
      arguments: args || {},
    };
    if (meta && Object.keys(meta).length > 0) {
      params._meta = meta;
    }
    return await this.request('tools/call', params);
  }

  async request(method, params = {}, timeoutMs = this.timeoutMs) {
    if (this.closed) {
      throw new McpTransportClosedError('Cannot send request: client transport is closed');
    }

    const id = randomUUID();
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(
            new McpTimeoutError(`Request '${method}' with id '${id}' timed out after ${timeoutMs}ms`, {
              id,
              method,
              timeoutMs,
            })
          );
        }, timeoutMs);
      }

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timer,
        method,
      });

      try {
        this.transport.send(message);
      } catch (err) {
        if (timer) clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new McpError(`Failed to send request '${method}': ${err.message}`, 'MCP_SEND_FAILED', err));
      }
    });
  }

  async notify(method, params = {}) {
    if (this.closed) {
      throw new McpTransportClosedError('Cannot send notification: client transport is closed');
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      this.transport.send(message);
    } catch (err) {
      throw new McpError(`Failed to send notification '${method}': ${err.message}`, 'MCP_SEND_FAILED', err);
    }
  }

  _handleMessage(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.id !== undefined && message.id !== null) {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(message.id);
      if (pending.timer) {
        clearTimeout(pending.timer);
      }

      if (message.error) {
        const errObj = message.error;
        const err = new McpError(
          errObj.message || 'MCP server error',
          errObj.code || 'MCP_RPC_ERROR',
          errObj.data || null
        );
        pending.reject(err);
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      this.emit('notification', message);
      this.emit(message.method, message.params);
    }
  }

  _handleTransportClose() {
    this.closed = true;
    this.initialized = false;
    const err = new McpTransportClosedError('Transport connection closed');
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
    this.emit('close');
  }

  _handleTransportError(err) {
    this.emit('error', err);
  }

  _ensureInitialized() {
    if (!this.initialized) {
      throw new McpProtocolError('McpClient must be initialized before calling methods');
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.initialized = false;

    const err = new McpTransportClosedError('Client explicitly closed');
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();

    if (this.transport && typeof this.transport.close === 'function') {
      try {
        await this.transport.close();
      } catch (err) {
      }
    }

    this.emit('close');
  }
}

module.exports = {
  McpClient,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
};