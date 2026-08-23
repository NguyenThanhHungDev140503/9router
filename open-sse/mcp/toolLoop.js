import { MAX_REACT_ITERATIONS } from "../config/mcpConstants.js";
import { extractToolCallsFromResponse, partitionToolCalls } from "./toolPartition.js";
import { executeToolCalls } from "./toolExecutor.js";
import { appendReActTurnToContext } from "./contextInjector.js";
import { createZeroUsage, accumulateUsage } from "./usageAccumulator.js";

/**
 * Autonomous ReAct tool loop engine.
 *
 * Coordinates turn-by-turn interactions:
 * 1. Invokes upstream LLM via executorFn(currentBody, isIntermediate).
 * 2. Parses tool calls and partitions into MCP vs Client calls.
 * 3. If no MCP calls or is terminal, returns final response.
 * 4. If MCP calls present, executes them, appends turn history to body, and loops.
 * 5. If MAX_REACT_ITERATIONS is reached, performs one final explanation turn with tool calling disabled or context note.
 */
export async function runToolLoop({
  initialBody,
  sourceFormat,
  executorFn,
  processManager,
  signal,
}) {
  let currentBody = initialBody;
  let turnsExecuted = 0;
  const cumulativeUsage = createZeroUsage();

  while (turnsExecuted < MAX_REACT_ITERATIONS) {
    if (signal?.aborted) {
      const abortErr = new Error("Request aborted by client");
      abortErr.name = "AbortError";
      throw abortErr;
    }

    turnsExecuted++;

    // Probe/execute turn with isIntermediate = true (buffered)
    const turnResult = await executorFn(currentBody, true);
    if (turnResult.usage) {
      accumulateUsage(cumulativeUsage, turnResult.usage);
    }

    // Extract tool calls from parsed response
    const toolCalls = extractToolCallsFromResponse(turnResult.parsedResponse || turnResult.rawResponse, sourceFormat);

    const { mcpCalls, clientCalls } = partitionToolCalls(toolCalls);

    if (mcpCalls.length === 0) {
      // No server-side MCP calls in this turn.
      // If client requested non-streaming or if this turn already contains the final parsed answer:
      // If this was Turn 1 and no intermediate turns ran, or if stream is requested,
      // executorFn can re-execute or reuse turnResult.
      let finalResult = turnResult;
      if (typeof executorFn.yieldFinalTurn === "function") {
        finalResult = await executorFn.yieldFinalTurn(currentBody, turnResult);
      }

      return {
        finalBody: currentBody,
        finalResponse: finalResult.parsedResponse || finalResult.rawResponse,
        rawResponse: finalResult.rawResponse,
        turnsExecuted,
        cumulativeUsage,
        isClientToolCall: clientCalls.length > 0,
      };
    }

    // Execute MCP tool calls
    const results = await executeToolCalls(processManager, mcpCalls);

    // Append turn history to current context body
    currentBody = appendReActTurnToContext(currentBody, mcpCalls, results, sourceFormat);
  }

  // If we reach here, we hit MAX_REACT_ITERATIONS.
  // Perform soft landing: one final turn forcing final answer.
  turnsExecuted++;
  const finalResult = await executorFn(currentBody, false);
  if (finalResult.usage) {
    accumulateUsage(cumulativeUsage, finalResult.usage);
  }

  return {
    finalBody: currentBody,
    finalResponse: finalResult.parsedResponse || finalResult.rawResponse,
    rawResponse: finalResult.rawResponse,
    turnsExecuted,
    cumulativeUsage,
    isClientToolCall: false,
    maxIterationsReached: true,
  };
}
