import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

describe("Users Repository", () => {
  let tempDir;
  let db;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-users-db-test-"));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();
    db = await import("@/lib/db/index.js");
    await db.initDb();
  });

  afterAll(() => {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("seeds a default admin user during migration", async () => {
    const users = await db.getUsers();
    expect(users.length).toBeGreaterThanOrEqual(1);

    const admin = users.find((u) => u.username === "admin");
    expect(admin).toBeDefined();
    expect(admin.role).toBe("admin");
    expect(admin.isActive).toBe(true);

    const validAdmin = await db.validateUserCredentials("admin", "123456");
    expect(validAdmin).toBeDefined();
    expect(validAdmin.id).toBe(admin.id);
  });

  it("creates, reads, updates, and validates standard users", async () => {
    const user = await db.createUser({
      username: "alice",
      password: "AlicePassword123!",
      role: "user",
    });

    expect(user.id).toBeDefined();
    expect(user.username).toBe("alice");
    expect(user.role).toBe("user");
    expect(user.isActive).toBe(true);

    const byId = await db.getUserById(user.id);
    expect(byId).toMatchObject({
      id: user.id,
      username: "alice",
      role: "user",
    });

    const byUsername = await db.getUserByUsername("alice");
    expect(byUsername.id).toBe(user.id);

    // Validate valid password
    const validated = await db.validateUserCredentials("alice", "AlicePassword123!");
    expect(validated).toBeDefined();
    expect(validated.id).toBe(user.id);

    // Validate invalid password
    const invalidAuth = await db.validateUserCredentials("alice", "WrongPassword");
    expect(invalidAuth).toBeNull();

    // Update password and role
    const updated = await db.updateUser(user.id, {
      role: "admin",
      password: "NewAlicePassword456!",
    });
    expect(updated.role).toBe("admin");

    const newAuth = await db.validateUserCredentials("alice", "NewAlicePassword456!");
    expect(newAuth).toBeDefined();

    // Deactivate user
    await db.updateUser(user.id, { isActive: false });
    const deactivatedAuth = await db.validateUserCredentials("alice", "NewAlicePassword456!");
    expect(deactivatedAuth).toBeNull();

    // Clean up
    await db.deleteUser(user.id);
    const afterDelete = await db.getUserById(user.id);
    expect(afterDelete).toBeNull();
  });

  it("prevents deleting the last admin user", async () => {
    const users = await db.getUsers({ role: "admin" });
    expect(users.length).toBe(1);
    const admin = users[0];

    await expect(db.deleteUser(admin.id)).rejects.toThrow(/Cannot delete the last admin user/);
  });

  it("prevents deactivating or demoting the last admin user", async () => {
    const users = await db.getUsers({ role: "admin" });
    const admin = users[0];

    await expect(db.updateUser(admin.id, { role: "user" })).rejects.toThrow(
      /Cannot demote the last active admin user/
    );

    await expect(db.updateUser(admin.id, { isActive: false })).rejects.toThrow(
      /Cannot deactivate the last active admin user/
    );
  });
});
