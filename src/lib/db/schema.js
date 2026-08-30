// ⚠️ AGENT/DEV: Bump this by +1 EVERY TIME you change the schema below
// (add/remove/alter a table, column, or index in TABLES). It drives the
// pre-change safety backup in migrate.js: when the stored version is lower,
// one lightweight DB backup is taken before applying schema changes. Forgetting
// to bump only skips that backup — it does NOT break the additive auto-sync.
export const SCHEMA_VERSION = 6;

export const PRAGMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

// Declarative current schema. Used by syncSchemaFromTables() to
// auto-add missing tables/columns/indexes after versioned migrations.
// For destructive changes (drop/rename/type-change), write a migration file.
export const TABLES = {
  _meta: {
    columns: {
      key: "TEXT PRIMARY KEY",
      value: "TEXT NOT NULL",
    },
  },
  users: {
    columns: {
      id: "TEXT PRIMARY KEY",
      username: "TEXT UNIQUE NOT NULL",
      password_hash: "TEXT NOT NULL",
      role: "TEXT NOT NULL DEFAULT 'user'",
      is_active: "INTEGER NOT NULL DEFAULT 1",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",
    ],
  },
  settings: {
    columns: {
      id: "INTEGER PRIMARY KEY CHECK (id = 1)",
      data: "TEXT NOT NULL",
    },
  },
  providerConnections: {
    columns: {
      id: "TEXT PRIMARY KEY",
      provider: "TEXT NOT NULL",
      authType: "TEXT NOT NULL",
      name: "TEXT",
      email: "TEXT",
      priority: "INTEGER",
      isActive: "INTEGER DEFAULT 1",
      isShared: "INTEGER DEFAULT 0",
      userId: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pc_provider ON providerConnections(provider)",
      "CREATE INDEX IF NOT EXISTS idx_pc_provider_active ON providerConnections(provider, isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pc_priority ON providerConnections(provider, priority)",
      "CREATE INDEX IF NOT EXISTS idx_pc_is_shared ON providerConnections(isShared)",
      "CREATE INDEX IF NOT EXISTS idx_pc_user_id ON providerConnections(userId)",
    ],
  },
  providerNodes: {
    columns: {
      id: "TEXT PRIMARY KEY",
      type: "TEXT",
      name: "TEXT",
      userId: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pn_type ON providerNodes(type)",
      "CREATE INDEX IF NOT EXISTS idx_pn_user_id ON providerNodes(userId)",
    ],
  },
  proxyPools: {
    columns: {
      id: "TEXT PRIMARY KEY",
      isActive: "INTEGER DEFAULT 1",
      testStatus: "TEXT",
      userId: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pp_active ON proxyPools(isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pp_status ON proxyPools(testStatus)",
      "CREATE INDEX IF NOT EXISTS idx_pp_user_id ON proxyPools(userId)",
    ],
  },
  apiKeys: {
    columns: {
      id: "TEXT PRIMARY KEY",
      key: "TEXT UNIQUE NOT NULL",
      name: "TEXT",
      machineId: "TEXT",
      isActive: "INTEGER DEFAULT 1",
      userId: "TEXT",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_ak_key ON apiKeys(key)",
      "CREATE INDEX IF NOT EXISTS idx_ak_user_id ON apiKeys(userId)",
    ],
  },
  combos: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      kind: "TEXT",
      userId: "TEXT",
      models: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_combo_user_name ON combos(userId, name)",
      "CREATE INDEX IF NOT EXISTS idx_combo_user_id ON combos(userId)",
    ],
  },
  kv: {
    columns: {
      scope: "TEXT NOT NULL",
      key: "TEXT NOT NULL",
      value: "TEXT NOT NULL",
    },
    primaryKey: "PRIMARY KEY (scope, key)",
    indexes: ["CREATE INDEX IF NOT EXISTS idx_kv_scope ON kv(scope)"],
  },
  usageHistory: {
    columns: {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      apiKey: "TEXT",
      endpoint: "TEXT",
      userId: "TEXT",
      promptTokens: "INTEGER DEFAULT 0",
      completionTokens: "INTEGER DEFAULT 0",
      cost: "REAL DEFAULT 0",
      status: "TEXT",
      tokens: "TEXT",
      meta: "TEXT",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_uh_ts ON usageHistory(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_uh_provider ON usageHistory(provider)",
      "CREATE INDEX IF NOT EXISTS idx_uh_model ON usageHistory(model)",
      "CREATE INDEX IF NOT EXISTS idx_uh_conn ON usageHistory(connectionId)",
      "CREATE INDEX IF NOT EXISTS idx_uh_user_id ON usageHistory(userId)",
    ],
  },
  usageDaily: {
    columns: {
      dateKey: "TEXT PRIMARY KEY",
      data: "TEXT NOT NULL",
    },
  },
  requestDetails: {
    columns: {
      id: "TEXT PRIMARY KEY",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      status: "TEXT",
      userId: "TEXT",
      data: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_rd_ts ON requestDetails(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_rd_provider ON requestDetails(provider)",
      "CREATE INDEX IF NOT EXISTS idx_rd_model ON requestDetails(model)",
      "CREATE INDEX IF NOT EXISTS idx_rd_conn ON requestDetails(connectionId)",
      "CREATE INDEX IF NOT EXISTS idx_rd_user_id ON requestDetails(userId)",
    ],
  },
  mcpServers: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      transport: "TEXT NOT NULL",
      command: "TEXT",
      args: "TEXT",
      env: "TEXT",
      url: "TEXT",
      enabled: "INTEGER NOT NULL DEFAULT 1",
      isShared: "INTEGER NOT NULL DEFAULT 0",
      userId: "TEXT",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_mcpServers_user_name ON mcpServers(userId, name);",
      "CREATE INDEX IF NOT EXISTS idx_mcpServers_enabled ON mcpServers(enabled);",
      "CREATE INDEX IF NOT EXISTS idx_mcpServers_is_shared ON mcpServers(isShared);",
      "CREATE INDEX IF NOT EXISTS idx_mcpServers_user_id ON mcpServers(userId);",
    ],
  },

  mcpToolsCache: {
    columns: {
      serverId: "TEXT PRIMARY KEY",
      tools: "TEXT NOT NULL DEFAULT '[]'",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_mcpToolsCache_updatedAt ON mcpToolsCache(updatedAt);",
    ],
  },

  skills: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      description: "TEXT",
      systemPrompt: "TEXT NOT NULL",
      enabled: "INTEGER NOT NULL DEFAULT 1",
      isShared: "INTEGER NOT NULL DEFAULT 0",
      matchRules: "TEXT",
      userId: "TEXT",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_user_name ON skills(userId, name);",
      "CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);",
      "CREATE INDEX IF NOT EXISTS idx_skills_is_shared ON skills(isShared);",
      "CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(userId);",
    ],
  },

  gatewayToolRules: {
    columns: {
      id: "TEXT PRIMARY KEY",
      toolName: "TEXT NOT NULL UNIQUE",
      action: "TEXT NOT NULL DEFAULT 'auto_execute'",
      timeoutMs: "INTEGER NOT NULL DEFAULT 30000",
      enabled: "INTEGER NOT NULL DEFAULT 1",
      userId: "TEXT",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_gatewayToolRules_user_tool ON gatewayToolRules(userId, toolName);",
      "CREATE INDEX IF NOT EXISTS idx_gatewayToolRules_enabled ON gatewayToolRules(enabled);",
      "CREATE INDEX IF NOT EXISTS idx_gatewayToolRules_user_id ON gatewayToolRules(userId);",
    ],
  },

  hermesBots: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL UNIQUE",
      role: "TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('coordinator', 'worker', 'specialist', 'evaluator', 'synthesizer'))",
      systemPrompt: "TEXT NOT NULL DEFAULT ''",
      comboId: "TEXT",
      toolWhitelist: "TEXT NOT NULL DEFAULT '[]'",
      capabilityWeights: "TEXT NOT NULL DEFAULT '{}'",
      config: "TEXT NOT NULL DEFAULT '{}'",
      enabled: "INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))",
      userId: "TEXT",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_hermesBots_name ON hermesBots(name);",
      "CREATE INDEX IF NOT EXISTS idx_hermesBots_role ON hermesBots(role);",
      "CREATE INDEX IF NOT EXISTS idx_hermesBots_enabled ON hermesBots(enabled);",
      "CREATE INDEX IF NOT EXISTS idx_hermesBots_comboId ON hermesBots(comboId);",
      "CREATE INDEX IF NOT EXISTS idx_hermesBots_user_id ON hermesBots(userId);",
    ],
  },

  hermesTasks: {
    columns: {
      id: "TEXT PRIMARY KEY",
      parentTaskId: "TEXT REFERENCES hermesTasks(id) ON DELETE CASCADE",
      swarmId: "TEXT REFERENCES swarmSessions(id) ON DELETE CASCADE",
      assignedBotId: "TEXT REFERENCES hermesBots(id) ON DELETE SET NULL",
      title: "TEXT NOT NULL",
      description: "TEXT",
      input: "TEXT NOT NULL DEFAULT '{}'",
      status: "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'running', 'completed', 'failed'))",
      priority: "INTEGER NOT NULL DEFAULT 0",
      retryCount: "INTEGER NOT NULL DEFAULT 0 CHECK (retryCount >= 0)",
      maxRetries: "INTEGER NOT NULL DEFAULT 3 CHECK (maxRetries >= 0)",
      error: "TEXT",
      result: "TEXT",
      scheduledAt: "TEXT",
      startedAt: "TEXT",
      completedAt: "TEXT",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_hermesTasks_status ON hermesTasks(status);",
      "CREATE INDEX IF NOT EXISTS idx_hermesTasks_assignedBotId ON hermesTasks(assignedBotId);",
      "CREATE INDEX IF NOT EXISTS idx_hermesTasks_swarmId ON hermesTasks(swarmId);",
      "CREATE INDEX IF NOT EXISTS idx_hermesTasks_parentTaskId ON hermesTasks(parentTaskId);",
      "CREATE INDEX IF NOT EXISTS idx_hermesTasks_queue ON hermesTasks(status, priority DESC, createdAt ASC);",
      "CREATE INDEX IF NOT EXISTS idx_hermesTasks_scheduledAt ON hermesTasks(scheduledAt);",
    ],
  },

  hermesTaskSteps: {
    columns: {
      id: "TEXT PRIMARY KEY",
      taskId: "TEXT NOT NULL REFERENCES hermesTasks(id) ON DELETE CASCADE",
      stepIndex: "INTEGER NOT NULL",
      name: "TEXT",
      status: "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed'))",
      input: "TEXT NOT NULL DEFAULT '{}'",
      output: "TEXT",
      error: "TEXT",
      startedAt: "TEXT",
      completedAt: "TEXT",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_hermesTaskSteps_task_step ON hermesTaskSteps(taskId, stepIndex);",
      "CREATE INDEX IF NOT EXISTS idx_hermesTaskSteps_status ON hermesTaskSteps(status);",
    ],
  },

  blackboard: {
    columns: {
      id: "TEXT PRIMARY KEY",
      swarmId: "TEXT REFERENCES swarmSessions(id) ON DELETE CASCADE",
      authorBotId: "TEXT REFERENCES hermesBots(id) ON DELETE SET NULL",
      content: "TEXT NOT NULL",
      tags: "TEXT NOT NULL DEFAULT '[]'",
      category: "TEXT NOT NULL DEFAULT 'fact' CHECK (category IN ('fact', 'code_snippet', 'hypothesis', 'critique', 'solution'))",
      validityScore: "REAL NOT NULL DEFAULT 1.0 CHECK (validityScore >= 0 AND validityScore <= 1)",
      confidenceScore: "REAL NOT NULL DEFAULT 0.0 CHECK (confidenceScore >= 0 AND confidenceScore <= 1)",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
      source: "TEXT",
      revision: "INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
      expiresAt: "TEXT",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_blackboard_swarmId ON blackboard(swarmId);",
      "CREATE INDEX IF NOT EXISTS idx_blackboard_authorBotId ON blackboard(authorBotId);",
      "CREATE INDEX IF NOT EXISTS idx_blackboard_category ON blackboard(category);",
      "CREATE INDEX IF NOT EXISTS idx_blackboard_validityScore ON blackboard(validityScore DESC);",
      "CREATE INDEX IF NOT EXISTS idx_blackboard_tags ON blackboard(tags);",
      "CREATE INDEX IF NOT EXISTS idx_blackboard_updatedAt ON blackboard(updatedAt DESC);",
      "CREATE INDEX IF NOT EXISTS idx_blackboard_revision ON blackboard(revision);",
    ],
  },

  blackboardLinks: {
    columns: {
      id: "TEXT PRIMARY KEY",
      sourceId: "TEXT NOT NULL REFERENCES blackboard(id) ON DELETE CASCADE",
      targetId: "TEXT NOT NULL REFERENCES blackboard(id) ON DELETE CASCADE",
      relationType: "TEXT NOT NULL DEFAULT 'related'",
      weight: "REAL NOT NULL DEFAULT 1.0 CHECK (weight >= 0)",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_blackboardLinks_pair ON blackboardLinks(sourceId, targetId, relationType);",
      "CREATE INDEX IF NOT EXISTS idx_blackboardLinks_sourceId ON blackboardLinks(sourceId);",
      "CREATE INDEX IF NOT EXISTS idx_blackboardLinks_targetId ON blackboardLinks(targetId);",
    ],
  },

  blackboardRevisions: {
    columns: {
      id: "TEXT PRIMARY KEY",
      entryId: "TEXT NOT NULL REFERENCES blackboard(id) ON DELETE CASCADE",
      revision: "INTEGER NOT NULL",
      content: "TEXT NOT NULL",
      tags: "TEXT NOT NULL DEFAULT '[]'",
      category: "TEXT NOT NULL",
      validityScore: "REAL NOT NULL DEFAULT 1.0",
      authorBotId: "TEXT REFERENCES hermesBots(id) ON DELETE SET NULL",
      changeType: "TEXT NOT NULL DEFAULT 'update'",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_blackboardRevisions_entryId ON blackboardRevisions(entryId);",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_blackboardRevisions_entry_revision ON blackboardRevisions(entryId, revision);",
      "CREATE INDEX IF NOT EXISTS idx_blackboardRevisions_createdAt ON blackboardRevisions(createdAt DESC);",
    ],
  },

  swarmSessions: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      strategy: "TEXT NOT NULL DEFAULT 'aco'",
      status: "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))",
      targetObjective: "TEXT NOT NULL",
      config: "TEXT NOT NULL DEFAULT '{}'",
      result: "TEXT",
      userId: "TEXT",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
      startedAt: "TEXT",
      completedAt: "TEXT",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_swarmSessions_status ON swarmSessions(status);",
      "CREATE INDEX IF NOT EXISTS idx_swarmSessions_createdAt ON swarmSessions(createdAt DESC);",
      "CREATE INDEX IF NOT EXISTS idx_swarmSessions_user_id ON swarmSessions(userId);",
    ],
  },

  swarmBots: {
    columns: {
      id: "TEXT PRIMARY KEY",
      swarmId: "TEXT NOT NULL REFERENCES swarmSessions(id) ON DELETE CASCADE",
      botId: "TEXT NOT NULL REFERENCES hermesBots(id) ON DELETE CASCADE",
      role: "TEXT",
      status: "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed'))",
      joinedAt: "TEXT NOT NULL",
      leftAt: "TEXT",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_swarmBots_membership ON swarmBots(swarmId, botId);",
      "CREATE INDEX IF NOT EXISTS idx_swarmBots_swarmId ON swarmBots(swarmId);",
      "CREATE INDEX IF NOT EXISTS idx_swarmBots_botId ON swarmBots(botId);",
      "CREATE INDEX IF NOT EXISTS idx_swarmBots_status ON swarmBots(status);",
    ],
  },

  swarmPheromones: {
    columns: {
      id: "TEXT PRIMARY KEY",
      swarmId: "TEXT NOT NULL REFERENCES swarmSessions(id) ON DELETE CASCADE",
      pathKey: "TEXT NOT NULL",
      decayRate: "REAL NOT NULL DEFAULT 0.1 CHECK (decayRate >= 0 AND decayRate <= 1)",
      depositAmount: "REAL NOT NULL DEFAULT 0 CHECK (depositAmount >= 0)",
      reinforcementValue: "REAL NOT NULL DEFAULT 0 CHECK (reinforcementValue >= 0)",
      strength: "REAL NOT NULL DEFAULT 0 CHECK (strength >= 0)",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_swarmPheromones_path ON swarmPheromones(swarmId, pathKey);",
      "CREATE INDEX IF NOT EXISTS idx_swarmPheromones_swarmId ON swarmPheromones(swarmId);",
      "CREATE INDEX IF NOT EXISTS idx_swarmPheromones_decayRate ON swarmPheromones(decayRate);",
      "CREATE INDEX IF NOT EXISTS idx_swarmPheromones_updatedAt ON swarmPheromones(updatedAt DESC);",
    ],
  },

  swarmColonyIterations: {
    columns: {
      id: "TEXT PRIMARY KEY",
      swarmId: "TEXT NOT NULL REFERENCES swarmSessions(id) ON DELETE CASCADE",
      iteration: "INTEGER NOT NULL",
      phase: "TEXT NOT NULL DEFAULT 'exploration' CHECK (phase IN ('exploration', 'exploitation'))",
      explorationRate: "REAL NOT NULL DEFAULT 0.5 CHECK (explorationRate >= 0 AND explorationRate <= 1)",
      exploitationRate: "REAL NOT NULL DEFAULT 0.5 CHECK (exploitationRate >= 0 AND exploitationRate <= 1)",
      bestPath: "TEXT",
      metrics: "TEXT NOT NULL DEFAULT '{}'",
      startedAt: "TEXT",
      completedAt: "TEXT",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_swarmColonyIterations_number ON swarmColonyIterations(swarmId, iteration);",
      "CREATE INDEX IF NOT EXISTS idx_swarmColonyIterations_swarmId ON swarmColonyIterations(swarmId);",
      "CREATE INDEX IF NOT EXISTS idx_swarmColonyIterations_phase ON swarmColonyIterations(phase);",
    ],
  },

  swarmConvergenceMetrics: {
    columns: {
      id: "TEXT PRIMARY KEY",
      swarmId: "TEXT NOT NULL REFERENCES swarmSessions(id) ON DELETE CASCADE",
      iterationId: "TEXT REFERENCES swarmColonyIterations(id) ON DELETE CASCADE",
      iteration: "INTEGER NOT NULL",
      variance: "REAL NOT NULL DEFAULT 0",
      consensusScore: "REAL NOT NULL DEFAULT 0 CHECK (consensusScore >= 0 AND consensusScore <= 1)",
      convergenceScore: "REAL NOT NULL DEFAULT 0 CHECK (convergenceScore >= 0 AND convergenceScore <= 1)",
      converged: "INTEGER NOT NULL DEFAULT 0 CHECK (converged IN (0, 1))",
      sampleCount: "INTEGER NOT NULL DEFAULT 0 CHECK (sampleCount >= 0)",
      metadata: "TEXT NOT NULL DEFAULT '{}'",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_swarmConvergenceMetrics_swarmId ON swarmConvergenceMetrics(swarmId);",
      "CREATE INDEX IF NOT EXISTS idx_swarmConvergenceMetrics_iteration ON swarmConvergenceMetrics(swarmId, iteration);",
      "CREATE INDEX IF NOT EXISTS idx_swarmConvergenceMetrics_createdAt ON swarmConvergenceMetrics(createdAt DESC);",
    ],
  },
};

export function buildCreateTableSql(name, def) {
  const cols = Object.entries(def.columns).map(([k, v]) => `${k} ${v}`);
  if (def.primaryKey) cols.push(def.primaryKey);
  return `CREATE TABLE IF NOT EXISTS ${name} (${cols.join(", ")})`;
}
