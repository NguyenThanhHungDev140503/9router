# Database Design Document: Hermes Gateway & Ant Colony Swarm Intelligence (PostgreSQL Engine)

## 1. Assumptions and Questions

### Assumptions
1. **Engine**: PostgreSQL 16+ (hỗ trợ `JSONB`, `UUIDv4`, `pgvector` extension cho semantic search và `LISTEN/NOTIFY`).
2. **Connection Pooling & Driver**: Node.js `pg` / `pg-pool` hoặc Next.js compatible client kết nối qua `DATABASE_URL`.
3. **Task Queue Scheduling**: Dùng cơ chế `SELECT ... FOR UPDATE SKIP LOCKED` của PostgreSQL để hàng trăm worker bot lấy task đồng thời mà không bị lock contention hay race conditions.
4. **Knowledge Retrieval**: Hỗ trợ vector embedding (`VECTOR(1536)` từ OpenAI/Claude) trực tiếp trong `hermes_shared_memory` cho Semantic Blackboard lookup song song với exact key lookup.
5. **Real-Time Streaming**: Tận dụng PostgreSQL `LISTEN/NOTIFY` hoặc polling trên table `hermes_task_events` cho Server-Sent Events (SSE) stream đến dashboard.
6. **Data Retention & Soft Delete**: Soft-disable cho bots (`enabled: FALSE`), status-based termination cho swarm runs, partitioned/cleanup policy cho `hermes_task_events`.

### Clarifications & Flags
- `pgvector` extension: Khởi tạo có điều kiện (`CREATE EXTENSION IF NOT EXISTS vector;`), nếu môi trường chưa cài extension sẽ fallback về exact key & metadata match.
- `swarm_run_id` trong `hermes_shared_memory`: `NULL` = Global Knowledge Base (dùng chung cho mọi runs); `UUID` = Run-Scoped Knowledge Base.

---

## 2. Entity-Relationship Diagram (DBML)

```dbml
Table hermes_bots {
  id uuid [pk, default: `gen_random_uuid()`]
  name varchar(255) [unique, not null]
  role varchar(50) [not null, note: 'coordinator | worker | specialist | evaluator | synthesizer']
  system_prompt text [not null]
  persona jsonb [not null, default: `'{}'`, note: 'tone, capabilities, constraints']
  combo_id varchar(36) [null, note: 'Logical FK to combos']
  mcp_bindings jsonb [not null, default: `'[]'`, note: 'Array of server IDs or tool names']
  enabled boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    name [unique, name: 'idx_hermes_bots_name']
    role [name: 'idx_hermes_bots_role']
    enabled [name: 'idx_hermes_bots_enabled']
    persona [type: gin, name: 'idx_hermes_bots_persona_gin']
  }
}

Table hermes_swarm_runs {
  id uuid [pk, default: `gen_random_uuid()`]
  name varchar(255) [not null]
  objective text [not null]
  orchestrator_bot_id uuid [null, ref: > hermes_bots.id]
  status varchar(30) [not null, default: 'pending', note: 'pending | running | completed | failed | cancelled']
  input jsonb [not null, default: `'{}'`]
  result jsonb [null, note: 'Final synthesis output']
  telemetry jsonb [not null, default: `'{}'`, note: 'Tokens, executionTimeMs, stepCount']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    status [name: 'idx_hermes_swarm_runs_status']
    created_at [name: 'idx_hermes_swarm_runs_created_at_desc']
  }
}

Table hermes_swarm_tasks {
  id uuid [pk, default: `gen_random_uuid()`]
  swarm_run_id uuid [not null, ref: > hermes_swarm_runs.id]
  parent_task_id uuid [null, ref: > hermes_swarm_tasks.id]
  assigned_bot_id uuid [null, ref: > hermes_bots.id]
  title varchar(255) [not null]
  description text [not null]
  status varchar(30) [not null, default: 'queued', note: 'queued | in_progress | completed | failed | blocked']
  priority integer [not null, default: 1, note: '1: low, 2: normal, 3: high, 4: critical']
  pheromone_strength double precision [not null, default: 1.0, note: 'Ant colony trail weight']
  input jsonb [not null, default: `'{}'`]
  output jsonb [null]
  error text [null]
  retry_count integer [not null, default: 0]
  max_retries integer [not null, default: 3]
  lock_token uuid [null, note: 'Worker claim lease token']
  locked_until timestamptz [null, note: 'Worker heartbeat lease expiry']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    swarm_run_id [name: 'idx_hermes_tasks_swarm_run_id']
    parent_task_id [name: 'idx_hermes_tasks_parent_task_id']
    assigned_bot_id [name: 'idx_hermes_tasks_assigned_bot_id']
    status [name: 'idx_hermes_tasks_status']
    (status, priority, pheromone_strength, created_at) [name: 'idx_hermes_tasks_queue_schedule']
    locked_until [name: 'idx_hermes_tasks_lease_recovery']
  }
}

Table hermes_shared_memory {
  id uuid [pk, default: `gen_random_uuid()`]
  swarm_run_id uuid [null, ref: > hermes_swarm_runs.id]
  namespace varchar(100) [not null, default: 'default', note: 'findings | decisions | facts | code']
  key varchar(255) [not null]
  content text [not null]
  metadata jsonb [not null, default: `'{}'`]
  ttl timestamptz [null, note: 'Expiration timestamp']
  access_count integer [not null, default: 0]
  last_accessed_at timestamptz [null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (swarm_run_id, namespace, key) [unique, name: 'idx_hermes_memory_lookup']
    namespace [name: 'idx_hermes_memory_namespace']
    ttl [name: 'idx_hermes_memory_ttl']
    metadata [type: gin, name: 'idx_hermes_memory_metadata_gin']
  }
}

Table hermes_task_events {
  id uuid [pk, default: `gen_random_uuid()`]
  swarm_run_id uuid [not null, ref: > hermes_swarm_runs.id]
  task_id uuid [null, ref: > hermes_swarm_tasks.id]
  bot_id uuid [null, ref: > hermes_bots.id]
  event_type varchar(50) [not null]
  payload jsonb [not null, default: `'{}'`]
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (swarm_run_id, created_at) [name: 'idx_hermes_events_swarm_run_ts']
    task_id [name: 'idx_hermes_events_task_id']
    bot_id [name: 'idx_hermes_events_bot_id']
    payload [type: gin, name: 'idx_hermes_events_payload_gin']
  }
}
```

---

## 3. Relational Schema with PK/FK/Constraints (PostgreSQL DDL)

```sql
-- Kích hoạt tiện ích mở rộng mở rộng nếu cần
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. hermes_bots
CREATE TABLE IF NOT EXISTS hermes_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  system_prompt TEXT NOT NULL,
  persona JSONB NOT NULL DEFAULT '{}'::jsonb,
  combo_id VARCHAR(36) DEFAULT NULL,
  mcp_bindings JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hermes_bots_name UNIQUE (name),
  CONSTRAINT chk_hermes_bots_role CHECK (role IN ('coordinator', 'worker', 'specialist', 'evaluator', 'synthesizer'))
);

-- 2. hermes_swarm_runs
CREATE TABLE IF NOT EXISTS hermes_swarm_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  objective TEXT NOT NULL,
  orchestrator_bot_id UUID DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB DEFAULT NULL,
  telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_hermes_runs_orchestrator FOREIGN KEY (orchestrator_bot_id) REFERENCES hermes_bots(id) ON DELETE SET NULL,
  CONSTRAINT chk_hermes_runs_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

-- 3. hermes_swarm_tasks
CREATE TABLE IF NOT EXISTS hermes_swarm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID NOT NULL,
  parent_task_id UUID DEFAULT NULL,
  assigned_bot_id UUID DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 1,
  pheromone_strength DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  lock_token UUID DEFAULT NULL,
  locked_until TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_hermes_tasks_run FOREIGN KEY (swarm_run_id) REFERENCES hermes_swarm_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_hermes_tasks_parent FOREIGN KEY (parent_task_id) REFERENCES hermes_swarm_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_hermes_tasks_bot FOREIGN KEY (assigned_bot_id) REFERENCES hermes_bots(id) ON DELETE SET NULL,
  CONSTRAINT chk_hermes_tasks_status CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'blocked')),
  CONSTRAINT chk_hermes_tasks_priority CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT chk_hermes_tasks_pheromone CHECK (pheromone_strength >= 0.0)
);

-- 4. hermes_shared_memory (Collective Knowledge Blackboard)
CREATE TABLE IF NOT EXISTS hermes_shared_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID DEFAULT NULL,
  namespace VARCHAR(100) NOT NULL DEFAULT 'default',
  key VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ttl TIMESTAMPTZ DEFAULT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_hermes_memory_run FOREIGN KEY (swarm_run_id) REFERENCES hermes_swarm_runs(id) ON DELETE CASCADE,
  CONSTRAINT uq_hermes_memory_lookup UNIQUE NULLS NOT DISTINCT (swarm_run_id, namespace, key)
);

-- 5. hermes_task_events (Event Log & SSE Stream Source)
CREATE TABLE IF NOT EXISTS hermes_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID NOT NULL,
  task_id UUID DEFAULT NULL,
  bot_id UUID DEFAULT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_hermes_events_run FOREIGN KEY (swarm_run_id) REFERENCES hermes_swarm_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_hermes_events_task FOREIGN KEY (task_id) REFERENCES hermes_swarm_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_hermes_events_bot FOREIGN KEY (bot_id) REFERENCES hermes_bots(id) ON DELETE SET NULL
);
```

---

## 4. PostgreSQL Migrations (Up / Down Scripts)

### Migration Up: `001_create_hermes_schema.up.sql`
```sql
BEGIN;

CREATE TABLE IF NOT EXISTS hermes_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('coordinator', 'worker', 'specialist', 'evaluator', 'synthesizer')),
  system_prompt TEXT NOT NULL,
  persona JSONB NOT NULL DEFAULT '{}'::jsonb,
  combo_id VARCHAR(36) DEFAULT NULL,
  mcp_bindings JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hermes_swarm_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  objective TEXT NOT NULL,
  orchestrator_bot_id UUID REFERENCES hermes_bots(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB DEFAULT NULL,
  telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hermes_swarm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID NOT NULL REFERENCES hermes_swarm_runs(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES hermes_swarm_tasks(id) ON DELETE CASCADE,
  assigned_bot_id UUID REFERENCES hermes_bots(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'in_progress', 'completed', 'failed', 'blocked')),
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  pheromone_strength DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK (pheromone_strength >= 0.0),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  lock_token UUID DEFAULT NULL,
  locked_until TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hermes_shared_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID REFERENCES hermes_swarm_runs(id) ON DELETE CASCADE,
  namespace VARCHAR(100) NOT NULL DEFAULT 'default',
  key VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ttl TIMESTAMPTZ DEFAULT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hermes_memory_lookup UNIQUE NULLS NOT DISTINCT (swarm_run_id, namespace, key)
);

CREATE TABLE IF NOT EXISTS hermes_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_run_id UUID NOT NULL REFERENCES hermes_swarm_runs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES hermes_swarm_tasks(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES hermes_bots(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: Tự động cập nhật `updated_at`
CREATE OR REPLACE FUNCTION update_hermes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hermes_bots_updated_at BEFORE UPDATE ON hermes_bots FOR EACH ROW EXECUTE FUNCTION update_hermes_timestamp();
CREATE TRIGGER trg_hermes_swarm_runs_updated_at BEFORE UPDATE ON hermes_swarm_runs FOR EACH ROW EXECUTE FUNCTION update_hermes_timestamp();
CREATE TRIGGER trg_hermes_swarm_tasks_updated_at BEFORE UPDATE ON hermes_swarm_tasks FOR EACH ROW EXECUTE FUNCTION update_hermes_timestamp();
CREATE TRIGGER trg_hermes_shared_memory_updated_at BEFORE UPDATE ON hermes_shared_memory FOR EACH ROW EXECUTE FUNCTION update_hermes_timestamp();

COMMIT;
```

### Migration Down: `001_create_hermes_schema.down.sql`
```sql
BEGIN;

DROP TRIGGER IF EXISTS trg_hermes_shared_memory_updated_at ON hermes_shared_memory;
DROP TRIGGER IF EXISTS trg_hermes_swarm_tasks_updated_at ON hermes_swarm_tasks;
DROP TRIGGER IF EXISTS trg_hermes_swarm_runs_updated_at ON hermes_swarm_runs;
DROP TRIGGER IF EXISTS trg_hermes_bots_updated_at ON hermes_bots;
DROP FUNCTION IF EXISTS update_hermes_timestamp;

DROP TABLE IF EXISTS hermes_task_events CASCADE;
DROP TABLE IF EXISTS hermes_shared_memory CASCADE;
DROP TABLE IF EXISTS hermes_swarm_tasks CASCADE;
DROP TABLE IF EXISTS hermes_swarm_runs CASCADE;
DROP TABLE IF EXISTS hermes_bots CASCADE;

COMMIT;
```

---

## 5. Index Strategy Justified by Expected Queries

```sql
-- 1. hermes_bots
CREATE INDEX IF NOT EXISTS idx_hermes_bots_role ON hermes_bots(role);
CREATE INDEX IF NOT EXISTS idx_hermes_bots_enabled ON hermes_bots(enabled);
CREATE INDEX IF NOT EXISTS idx_hermes_bots_persona_gin ON hermes_bots USING GIN (persona);

-- 2. hermes_swarm_runs
CREATE INDEX IF NOT EXISTS idx_hermes_swarm_runs_status ON hermes_swarm_runs(status);
CREATE INDEX IF NOT EXISTS idx_hermes_swarm_runs_created_at ON hermes_swarm_runs(created_at DESC);

-- 3. hermes_swarm_tasks
CREATE INDEX IF NOT EXISTS idx_hermes_tasks_swarm_run_id ON hermes_swarm_tasks(swarm_run_id);
CREATE INDEX IF NOT EXISTS idx_hermes_tasks_parent_task_id ON hermes_swarm_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_hermes_tasks_assigned_bot_id ON hermes_swarm_tasks(assigned_bot_id);
CREATE INDEX IF NOT EXISTS idx_hermes_tasks_status ON hermes_swarm_tasks(status);

-- Tối ưu cho queue scheduling & concurrency lock (SKIP LOCKED)
CREATE INDEX IF NOT EXISTS idx_hermes_tasks_queue_schedule 
ON hermes_swarm_tasks (status, priority DESC, pheromone_strength DESC, created_at ASC)
WHERE status = 'queued';

-- Tối ưu kiểm tra timeout lease
CREATE INDEX IF NOT EXISTS idx_hermes_tasks_lease_recovery 
ON hermes_swarm_tasks (locked_until)
WHERE status = 'in_progress' AND locked_until IS NOT NULL;

-- 4. hermes_shared_memory
CREATE INDEX IF NOT EXISTS idx_hermes_memory_namespace ON hermes_shared_memory(namespace);
CREATE INDEX IF NOT EXISTS idx_hermes_memory_ttl ON hermes_shared_memory(ttl) WHERE ttl IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hermes_memory_metadata_gin ON hermes_shared_memory USING GIN (metadata);

-- 5. hermes_task_events
CREATE INDEX IF NOT EXISTS idx_hermes_events_swarm_run_ts ON hermes_task_events(swarm_run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_hermes_events_task_id ON hermes_task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_hermes_events_bot_id ON hermes_task_events(bot_id);
CREATE INDEX IF NOT EXISTS idx_hermes_events_payload_gin ON hermes_task_events USING GIN (payload);
```

**Biện minh:**
- `idx_hermes_tasks_queue_schedule`: Partial Index chỉ đánh trên các task `status = 'queued'`. Giảm dung lượng index, tăng tốc truy vấn lấy task tiếp theo xuống < 1ms.
- `idx_hermes_events_swarm_run_ts`: Cho phép client dashboard fetch log tuần tự theo thời gian hoặc stream mà không cần sort in-memory.
- GIN Indexes (`persona`, `metadata`, `payload`): Hỗ trợ tìm kiếm theo tags hoặc thuộc tính JSON lồng nhau (e.g. `metadata @> '{"confidence": 0.9}'`).

---

## 6. Audit, Soft-Delete, Concurrency & Authorization Strategy

### 6.1 Concurrency with `SKIP LOCKED` (Worker Task Leasing)
Khi hàng chục bot lấy task cùng lúc, worker dùng câu lệnh an toàn:
```sql
WITH next_task AS (
  SELECT id
  FROM hermes_swarm_tasks
  WHERE status = 'queued' AND (assigned_bot_id = $1 OR assigned_bot_id IS NULL)
  ORDER BY priority DESC, pheromone_strength DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE hermes_swarm_tasks t
SET status = 'in_progress',
    assigned_bot_id = $1,
    lock_token = $2,
    locked_until = NOW() + INTERVAL '5 minutes'
FROM next_task
WHERE t.id = next_task.id
RETURNING t.*;
```

### 6.2 Atomic Pheromone Trail Update & Evaporation
```sql
-- Củng cố đường đi khi task thành công (Reinforcement)
UPDATE hermes_swarm_tasks
SET pheromone_strength = pheromone_strength + $1
WHERE id = $2;

-- Bay hơi định kỳ (Evaporation Cycle)
UPDATE hermes_swarm_tasks
SET pheromone_strength = GREATEST(0.1, pheromone_strength * $1)
WHERE swarm_run_id = $2;
```

### 6.3 Real-Time Pub/Sub via PostgreSQL `LISTEN / NOTIFY`
Trigger tự động bắn NOTIFY khi có event mới trong `hermes_task_events`:
```sql
CREATE OR REPLACE FUNCTION notify_hermes_task_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('hermes_events', json_build_object(
    'run_id', NEW.swarm_run_id,
    'task_id', NEW.task_id,
    'bot_id', NEW.bot_id,
    'event_type', NEW.event_type,
    'created_at', NEW.created_at
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hermes_event_notify
AFTER INSERT ON hermes_task_events
FOR EACH ROW EXECUTE FUNCTION notify_hermes_task_event();
```

---

## 7. Seed Data and Validation Queries

### Seed Data
```sql
-- 1. Seed Bots
INSERT INTO hermes_bots (id, name, role, system_prompt, persona, mcp_bindings, enabled)
VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Hermes Coordinator', 'coordinator', 'Deconstruct objectives into parallel subtasks and oversee execution.', '{"tone": "strategic", "lead": true}'::jsonb, '[]'::jsonb, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Backend Engineer', 'worker', 'Implement server logic, database repositories, and tests.', '{"tone": "precise", "skills": ["sql", "node"]}'::jsonb, '["filesystem", "git"]'::jsonb, true),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Critique Sentinel', 'evaluator', 'Validate correctness and security of worker outputs.', '{"tone": "critical"}'::jsonb, '[]'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

-- 2. Seed Swarm Run
INSERT INTO hermes_swarm_runs (id, name, objective, orchestrator_bot_id, status, input)
VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'Build Hermes Postgres Layer', 'Design and implement Postgres repositories for Hermes Swarm', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'running', '{"target_db": "postgres"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed Task
INSERT INTO hermes_swarm_tasks (id, swarm_run_id, assigned_bot_id, title, description, status, priority, pheromone_strength)
VALUES
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a31', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Create Postgres Repositories', 'Write hermesBotRepo, hermesTaskRepo, hermesMemoryRepo using pg client', 'queued', 3, 2.0)
ON CONFLICT (id) DO NOTHING;
```

### Validation Queries
```sql
-- 1. Test Task Queue Claiming (Simulate concurrency)
BEGIN;
SELECT * FROM hermes_swarm_tasks
WHERE status = 'queued'
ORDER BY priority DESC, pheromone_strength DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
COMMIT;

-- 2. Test Upsert Memory Blackboard (Postgres ON CONFLICT)
INSERT INTO hermes_shared_memory (swarm_run_id, namespace, key, content, metadata, ttl)
VALUES ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'decisions', 'architecture', 'Use PostgreSQL native client with pooling', '{"confidence": 0.99}'::jsonb, NOW() + INTERVAL '1 day')
ON CONFLICT (swarm_run_id, namespace, key)
DO UPDATE SET content = EXCLUDED.content, metadata = EXCLUDED.metadata, access_count = hermes_shared_memory.access_count + 1, last_accessed_at = NOW(), updated_at = NOW()
RETURNING *;

-- 3. Test Expired Memory Cleanup
DELETE FROM hermes_shared_memory
WHERE ttl IS NOT NULL AND ttl < NOW();
```

---

## 8. Trade-offs and Future Extension Plan

| Dimension | PostgreSQL Solution | Trade-off / Complexity | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Concurrency** | `FOR UPDATE SKIP LOCKED` | Cần transaction management chuẩn | Đóng gói claim task trong repository methods với retry logic |
| **Real-time Eventing** | `LISTEN / NOTIFY` | Giới hạn 8000 bytes/payload | Chỉ truyền event metadata qua notify; client fetch full JSON payload từ bảng |
| **JSON Indexing** | Native `JSONB` & `GIN` | Dung lượng index lớn hơn B-Tree | Chỉ đánh GIN trên metadata và payload cần query |
| **Semantic Search** | `pgvector` (`VECTOR(1536)`) | Cần cài extension trên Postgres instance | Graceful fallback về exact matching nếu extension không khả dụng |
