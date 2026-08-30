import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runToolLoop } from "../../open-sse/mcp/toolLoop.js";

describe("E2E ReAct Tool Loop Pipeline Simulation", () => {
  let mockServer;
  let mockPort;
  let mockBaseUrl;
  let callHistory = [];

  before(async () => {
    // Start local HTTP upstream mock
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        const parsed = JSON.parse(body);
        callHistory.push({ url: req.url, body: parsed });

        const messages = parsed.messages || [];
        const lastMsg = messages[messages.length - 1];

        // Turn 1: if last message is user query, return tool call
        if (lastMsg.role === "user") {
          const resp = {
            id: "chatcmpl-mock-1",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_calc_99",
                      type: "function",
                      function: {
                        name: "mcp__calc_srv__evaluate",
                        arguments: JSON.stringify({ expr: "40 + 2" })
                      }
                    }
                  ]
                },
                finish_reason: "tool_calls"
              }
            ],
            usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
          };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(resp));
        } else if (lastMsg.role === "tool") {
          // Turn 2: LLM receives tool result, returns final answer
          const resp = {
            id: "chatcmpl-mock-2",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "The calculated result is 42."
                },
                finish_reason: "stop"
              }
            ],
            usage: { prompt_tokens: 45, completion_tokens: 10, total_tokens: 55 }
          };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(resp));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unexpected state" }));
        }
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        mockPort = mockServer.address().port;
        mockBaseUrl = `http://127.0.0.1:${mockPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  it("simulates full end-to-end multi-turn tool execution against mock LLM", async () => {
    callHistory = [];

    // Mock MCP Process Manager with callTool
    const mockProcessManager = {
      callTool: async (serverId, toolName, args) => {
        assert.equal(serverId, "calc_srv");
        assert.equal(toolName, "evaluate");
        assert.equal(args.expr, "40 + 2");
        return {
          content: [{ type: "text", text: "42" }],
          isError: false
        };
      },
      logActivity: () => {}
    };

    // Executor function that posts to our mock upstream server
    const upstreamExecutor = async (augmentedBody, isIntermediate) => {
      const response = await fetch(`${mockBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(augmentedBody)
      });
      const data = await response.json();
      return {
        rawResponse: data,
        parsedResponse: data,
        usage: data.usage
      };
    };

    const initialBody = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "What is 40 + 2?" }]
    };

    const result = await runToolLoop({
      initialBody,
      sourceFormat: "openai",
      executorFn: upstreamExecutor,
      processManager: mockProcessManager
    });

    assert.equal(result.finalResponse.choices[0].message.content, "The calculated result is 42.");
    assert.equal(result.cumulativeUsage.prompt_tokens, 65);
    assert.equal(result.cumulativeUsage.completion_tokens, 25);
    assert.equal(result.cumulativeUsage.total_tokens, 90);
    assert.equal(result.turnsExecuted, 2);
    assert.equal(callHistory.length, 2);
  });
});
