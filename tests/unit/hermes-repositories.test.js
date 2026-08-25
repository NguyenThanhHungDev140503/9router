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
    await expect(repo.recordTaskStep(task.id, { stepIndex: 1 })).rejects.toThrow();
    await expect(repo.recordTaskStep(task.id, {})).rejects.toThrow("stepIndex must be a non-negative integer");
  });

  it("tracks failed task retry state and returns structured errors", async () => {
    const repo = await import("@/lib/db/repos/hermesRepo.js");
    const task = await repo.createTask({ title: "Retry task", maxRetries: 2 });
    const error = { code: "UPSTREAM_TIMEOUT", retryable: true, detail: { attempt: 1 } };

    const failed = await repo.failTask(task.id, error);

    expect(failed.status).toBe("failed");
    expect(failed.retryCount).toBe(1);
    expect(failed.maxRetries).toBe(2);
    expect(failed.completedAt).toEqual(expect.any(String));
    expect(failed.error).toEqual(error);
    expect((await repo.getTaskById(task.id)).error).toEqual(error);
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

  it("stores ordered colony iterations and convergence metrics with JSON metadata", async () => {
    const swarm = await import("@/lib/db/repos/swarmRepo.js");
    const session = await swarm.createSwarmSession({ targetObjective: "Converge" });
    const second = await swarm.recordColonyIteration({
      swarmId: session.id,
      iteration: 2,
      phase: "exploitation",
      explorationRate: 0.2,
      exploitationRate: 0.8,
      bestPath: "path-b",
      metrics: { score: 0.9, branches: ["path-a", "path-b"] },
    });
    await swarm.recordColonyIteration({
      swarmId: session.id,
      iteration: 1,
      phase: "exploration",
      metrics: { score: 0.5 },
    });
    await swarm.recordConvergenceMetric({
      swarmId: session.id,
      iterationId: second.id,
      iteration: 2,
      variance: 0.12,
      consensusScore: 0.88,
      convergenceScore: 0.91,
      converged: true,
      sampleCount: 7,
      metadata: { winningPath: "path-b", reasons: ["low variance"] },
    });

    expect(await swarm.getColonyIterations(session.id)).toEqual([
      expect.objectContaining({ iteration: 1, phase: "exploration", metrics: { score: 0.5 } }),
      expect.objectContaining({
        id: second.id,
        iteration: 2,
        phase: "exploitation",
        explorationRate: 0.2,
        exploitationRate: 0.8,
        bestPath: "path-b",
        metrics: { score: 0.9, branches: ["path-a", "path-b"] },
      }),
    ]);
    expect(await swarm.getConvergenceHistory(session.id)).toEqual([
      expect.objectContaining({
        iterationId: second.id,
        iteration: 2,
        variance: 0.12,
        consensusScore: 0.88,
        convergenceScore: 0.91,
        converged: 1,
        sampleCount: 7,
        metadata: { winningPath: "path-b", reasons: ["low variance"] },
      }),
    ]);
  });

  it("tracks blackboard revisions and graph links", async () => {
    const swarm = await import("@/lib/db/repos/swarmRepo.js");
    const repo = await import("@/lib/db/repos/blackboardRepo.js");
    const session = await swarm.createSwarmSession({ targetObjective: "test" });
    const first = await repo.createBlackboardEntry({ content: "fact", tags: ["important"], swarmId: session.id });
    const second = await repo.createBlackboardEntry({ content: "solution", swarmId: session.id, category: "solution" });
    expect(first.revision).toBe(0);
    const stale = await repo.getBlackboardEntryById(first.id);
    const updated = await repo.updateBlackboardEntry(first.id, { content: "updated", validityScore: 0.8 }, first.revision);
    await expect(repo.updateBlackboardEntry(first.id, { confidenceScore: 0.9 }, stale.revision)).rejects.toThrow("Blackboard entry changed concurrently");
    expect((await repo.getBlackboardEntryById(first.id)).content).toBe("updated");
    await repo.updateBlackboardEntry(first.id, { confidenceScore: 0.9 }, updated.revision);
    expect((await repo.getBlackboardEntryById(first.id)).revision).toBe(2);
    await repo.linkBlackboardEntries(first.id, second.id, "supports", 0.7);
    expect((await repo.getEntryRevisions(first.id))).toHaveLength(2);
    expect((await repo.getBlackboardLinks(first.id))).toHaveLength(1);
    expect((await repo.searchBlackboard("updated", ["important"]))).toHaveLength(1);
  });

  it("returns graph links from both endpoints and JSON metadata", async () => {
    const swarm = await import("@/lib/db/repos/swarmRepo.js");
    const repo = await import("@/lib/db/repos/blackboardRepo.js");
    const session = await swarm.createSwarmSession({ targetObjective: "graph" });
    const source = await repo.createBlackboardEntry({
      content: "source",
      swarmId: session.id,
      metadata: { origin: { bot: "researcher" } },
    });
    const target = await repo.createBlackboardEntry({
      content: "target",
      swarmId: session.id,
      metadata: { sourceIds: ["doc-1"] },
    });

    await repo.linkBlackboardEntries(source.id, target.id, "supports", 0.7);

    expect((await repo.getBlackboardEntryById(source.id)).metadata).toEqual({ origin: { bot: "researcher" } });
    expect((await repo.getBlackboardEntryById(target.id)).metadata).toEqual({ sourceIds: ["doc-1"] });
    expect(await repo.getBlackboardLinks(source.id)).toEqual([
      expect.objectContaining({ sourceId: source.id, targetId: target.id, relationType: "supports", weight: 0.7, metadata: {} }),
    ]);
    expect(await repo.getBlackboardLinks(target.id)).toEqual([
      expect.objectContaining({ sourceId: source.id, targetId: target.id, relationType: "supports", weight: 0.7, metadata: {} }),
    ]);
    expect(await repo.getBlackboardGraph(session.id)).toEqual({
      entries: expect.arrayContaining([
        expect.objectContaining({ id: source.id, metadata: { origin: { bot: "researcher" } } }),
        expect.objectContaining({ id: target.id, metadata: { sourceIds: ["doc-1"] } }),
      ]),
      links: [
        expect.objectContaining({ sourceId: source.id, targetId: target.id, relationType: "supports", weight: 0.7, metadata: {} }),
      ],
    });
  });

  it("rejects malformed optimistic-lock revisions without changing blackboard state", async () => {
    const repo = await import("@/lib/db/repos/blackboardRepo.js");
    const entry = await repo.createBlackboardEntry({ content: "stable" });

    for (const expectedRevision of [undefined, -1, 0.5, "0", Number.NaN]) {
      await expect(repo.updateBlackboardEntry(entry.id, { content: "changed" }, expectedRevision)).rejects.toThrow(
        "expectedRevision must be a non-negative integer",
      );
    }

    expect(await repo.getBlackboardEntryById(entry.id)).toEqual(expect.objectContaining({ content: "stable", revision: 0 }));
    expect(await repo.getEntryRevisions(entry.id)).toEqual([]);
  });
});
