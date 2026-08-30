import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({
      status: init?.status || 200,
      json: async () => body,
      body,
    }),
  },
}));

vi.mock("@/lib/auth/userContext", () => ({
  getUserContext: vi.fn(async () => ({ userId: "1", role: "admin", username: "admin", isAdmin: true })),
}));

vi.mock("@/lib/db/repos/skillsRepo", () => {
  let skills = [];
  let rules = [];
  return {
    getSkills: vi.fn(async ({ enabled, tag } = {}) => {
      let res = [...skills];
      if (enabled !== undefined) res = res.filter((s) => s.enabled === enabled);
      if (tag) res = res.filter((s) => s.tags && s.tags.includes(tag));
      return res;
    }),
    getAccessibleSkills: vi.fn(async ({ enabled } = {}) => {
      let res = [...skills];
      if (enabled !== undefined) res = res.filter((s) => s.enabled === enabled);
      return res;
    }),
    getSkillById: vi.fn(async (id) => skills.find((s) => s.id === id) || null),
    getSkillByName: vi.fn(async (name) => skills.find((s) => s.name === name) || null),
    createSkill: vi.fn(async (data) => {
      const newSkill = { id: "skill-" + Date.now(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      skills.push(newSkill);
      return newSkill;
    }),
    updateSkill: vi.fn(async (id, data) => {
      const idx = skills.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      skills[idx] = { ...skills[idx], ...data, updatedAt: new Date().toISOString() };
      return skills[idx];
    }),
    deleteSkill: vi.fn(async (id) => {
      const idx = skills.findIndex((s) => s.id === id);
      if (idx === -1) return false;
      skills.splice(idx, 1);
      return true;
    }),
    getGatewayToolRules: vi.fn(async ({ enabled } = {}) => {
      if (enabled !== undefined) return rules.filter((r) => r.enabled === enabled);
      return [...rules];
    }),
    getGatewayToolRuleById: vi.fn(async (id) => rules.find((r) => r.id === id) || null),
    createGatewayToolRule: vi.fn(async (data) => {
      const newRule = { id: "rule-" + Date.now(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      rules.push(newRule);
      return newRule;
    }),
    updateGatewayToolRule: vi.fn(async (id, data) => {
      const idx = rules.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      rules[idx] = { ...rules[idx], ...data, updatedAt: new Date().toISOString() };
      return rules[idx];
    }),
    deleteGatewayToolRule: vi.fn(async (id) => {
      const idx = rules.findIndex((r) => r.id === id);
      if (idx === -1) return false;
      rules.splice(idx, 1);
      return true;
    }),
    _reset: () => {
      skills = [];
      rules = [];
    },
  };
});

import { GET as listSkills, POST as createSkill } from "@/app/api/skills/route";
import { GET as getSkill, PUT as updateSkill, DELETE as deleteSkill } from "@/app/api/skills/[id]/route";
import { GET as listRules, POST as createRule } from "@/app/api/skills/rules/route";
import { GET as getRule, PUT as updateRule, DELETE as deleteRule } from "@/app/api/skills/rules/[id]/route";
import * as skillsRepo from "@/lib/db/repos/skillsRepo";

describe("Custom Skills & Tool Rules REST API", () => {
  beforeEach(() => {
    skillsRepo._reset();
    vi.clearAllMocks();
  });

  describe("Skills CRUD", () => {
    it("creates, retrieves, updates, and deletes a skill", async () => {
      // 1. Create
      const postReq = new Request("http://localhost/api/skills", {
        method: "POST",
        body: JSON.stringify({
          name: "Code Reviewer",
          description: "Review code",
          systemPrompt: "You are a code reviewer",
          tags: ["review", "dev"],
          enabled: true,
        }),
      });
      const postRes = await createSkill(postReq);
      expect(postRes.status).toBe(201);
      const postJson = await postRes.json();
      expect(postJson.skill.name).toBe("Code Reviewer");
      const skillId = postJson.skill.id;

      // 2. List with tag filter
      const listReq = new Request("http://localhost/api/skills?tag=review");
      const listRes = await listSkills(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.skills).toHaveLength(1);

      // 3. Get single
      const getReq = new Request("http://localhost/api/skills/" + skillId);
      const getRes = await getSkill(getReq, { params: Promise.resolve({ id: skillId }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.skill.systemPrompt).toBe("You are a code reviewer");

      // 4. Update
      const putReq = new Request("http://localhost/api/skills/" + skillId, {
        method: "PUT",
        body: JSON.stringify({ name: "Senior Reviewer" }),
      });
      const putRes = await updateSkill(putReq, { params: Promise.resolve({ id: skillId }) });
      expect(putRes.status).toBe(200);
      const putJson = await putRes.json();
      expect(putJson.skill.name).toBe("Senior Reviewer");

      // 5. Delete
      const delReq = new Request("http://localhost/api/skills/" + skillId, { method: "DELETE" });
      const delRes = await deleteSkill(delReq, { params: Promise.resolve({ id: skillId }) });
      expect(delRes.status).toBe(200);
    });

    it("validates skill inputs", async () => {
      const badReq = new Request("http://localhost/api/skills", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      });
      const badRes = await createSkill(badReq);
      expect(badRes.status).toBe(400);
    });
  });

  describe("Gateway Tool Rules CRUD", () => {
    it("creates, retrieves, updates, and deletes a tool rule", async () => {
      // 1. Create
      const postReq = new Request("http://localhost/api/skills/rules", {
        method: "POST",
        body: JSON.stringify({
          pattern: "mcp__filesystem__*",
          action: "allow",
          priority: 10,
          enabled: true,
        }),
      });
      const postRes = await createRule(postReq);
      expect(postRes.status).toBe(201);
      const postJson = await postRes.json();
      expect(postJson.rule.pattern).toBe("mcp__filesystem__*");
      const ruleId = postJson.rule.id;

      // 2. List
      const listReq = new Request("http://localhost/api/skills/rules");
      const listRes = await listRules(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.rules).toHaveLength(1);

      // 3. Get single
      const getReq = new Request("http://localhost/api/skills/rules/" + ruleId);
      const getRes = await getRule(getReq, { params: Promise.resolve({ id: ruleId }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.rule.pattern).toBe("mcp__filesystem__*");

      // 4. Update
      const putReq = new Request("http://localhost/api/skills/rules/" + ruleId, {
        method: "PUT",
        body: JSON.stringify({ priority: 20 }),
      });
      const putRes = await updateRule(putReq, { params: Promise.resolve({ id: ruleId }) });
      expect(putRes.status).toBe(200);
      const putJson = await putRes.json();
      expect(putJson.rule.priority).toBe(20);

      // 5. Delete
      const delReq = new Request("http://localhost/api/skills/rules/" + ruleId, { method: "DELETE" });
      const delRes = await deleteRule(delReq, { params: Promise.resolve({ id: ruleId }) });
      expect(delRes.status).toBe(200);
    });

    it("validates rule inputs (action, pattern, inject_skill requirement)", async () => {
      // Missing pattern
      const res1 = await createRule(new Request("http://localhost/api/skills/rules", {
        method: "POST",
        body: JSON.stringify({ action: "allow" }),
      }));
      expect(res1.status).toBe(400);

      // Invalid action
      const res2 = await createRule(new Request("http://localhost/api/skills/rules", {
        method: "POST",
        body: JSON.stringify({ pattern: "foo", action: "invalid_action" }),
      }));
      expect(res2.status).toBe(400);

      // inject_skill missing skillId
      const res3 = await createRule(new Request("http://localhost/api/skills/rules", {
        method: "POST",
        body: JSON.stringify({ pattern: "foo", action: "inject_skill" }),
      }));
      expect(res3.status).toBe(400);
    });
  });
});
