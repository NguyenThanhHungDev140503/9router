import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-hermes-repo-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("Hermes repositories", () => {
  it("supports bot and task lifecycle with JSON fields", async () => {
    const repo = await import("@/lib/db/repos/hermesRepo.js");
    const bot = await repo.createBot({ name: "worker", toolWhitelist: ["search"], capabilityWeights: { code: 0.9 } });
    expect(bot.toolWhitelist).toEqual(["search"]);
    expect((await repo.getBotById(bot.id)).capabilityWeights).toEqual({ code: 0.9 });

    const task = await repo.createTask({ title: "Inspect code", input: { path: "src" }, priority: 5 });
    expect((await repo.claimNextPendingTask(bot.id)).assignedBotId).toBe(bot.id);
    expect((await repo.updateTaskStatus(task.id, "completed", { ok: true })).result).toEqual({ ok: true });
    await repo.recordTaskStep(task.id, { stepIndex: 1, output: { answer: 42 }, status: "completed" });
    expect((await repo.getTaskSteps(task.id))[0].output).toEqual({ answer: 42 });
  });

  it("manages swarm membership and pheromone decay", async () => {
    const hermes = await import("@/lib/db/repos/hermesRepo.js");
    const swarm = await import("@/lib/db/repos/swarmRepo.js");
    const bot = await hermes.createBot({ name: "ant" });
    const session = await swarm.createSwarmSession({ targetObjective: "Find solution" });
    await swarm.addBotToSwarm(session.id, bot.id, "worker");
    expect((await swarm.getSwarmBots(session.id))).toHaveLength(1);
    await swarm.depositPheromone(session.id, "path-a", 10);
    await swarm.decayPheromones(session.id, 0.2);
    expect((await swarm.getPheromones(session.id))[0].strength).toBeCloseTo(8);
  });

  it("tracks blackboard revisions and graph links", async () => {
    const swarm = await import("@/lib/db/repos/swarmRepo.js");
    const repo = await import("@/lib/db/repos/blackboardRepo.js");
    const session = await swarm.createSwarmSession({ targetObjective: "test" });
    const first = await repo.createBlackboardEntry({ content: "fact", tags: ["important"], swarmId: session.id });
    const second = await repo.createBlackboardEntry({ content: "solution", swarmId: session.id, category: "solution" });
    await repo.updateBlackboardEntry(first.id, { content: "updated", validityScore: 0.8 });
    await repo.linkBlackboardEntries(first.id, second.id, "supports", 0.7);
    expect((await repo.getEntryRevisions(first.id))).toHaveLength(1);
    expect((await repo.getBlackboardLinks(first.id))).toHaveLength(1);
    expect((await repo.searchBlackboard("updated", ["important"]))).toHaveLength(1);
  });
});
