---
phase: "08"
phase_name: "Database Schema & Hermes Repositories"
milestone: "v2.0"
created_at: "2026-08-24T22:05:00.000Z"
requirements:
  - HERMES-DB-01
  - HERMES-DB-02
  - HERMES-DB-03
---

# Phase 8 Spec: PostgreSQL Schema & Hermes Repositories

## Overview & Goal
Thiết lập toàn diện nền tảng lưu trữ **PostgreSQL** và Data Access Layer (Repositories) cho hệ sinh thái **Hermes Gateway & Ant Colony Swarm Intelligence**. Thiết kế hỗ trợ xử lý đồng thời quy mô lớn (High Concurrency), Atomic Task Claiming (`SKIP LOCKED`), Native `JSONB` với GIN indexing, Real-time eventing (`LISTEN/NOTIFY`), và hỗ trợ mở rộng Semantic Search (`pgvector`).

---

## 1. Functional Scope & Requirements Mapping

### 1.1 HERMES-DB-01: PostgreSQL Schema Definition & Migration
1. Khởi tạo schema PostgreSQL với 5 bảng cốt lõi:
   - `hermes_bots`: Định nghĩa bot identities, roles, system prompts, personas, MCP tool bindings, active state.
   - `hermes_swarm_runs`: Quản lý vòng đời swarm chạy cấp cao (objectives, orchestrator bot, status, input, result, telemetry).
   - `hermes_swarm_tasks`: Hàng đợi phân rã task với hỗ trợ lock leasing (`lock_token`, `locked_until`), priority, pheromone trail strength.
   - `hermes_shared_memory`: Collective Knowledge Blackboard hỗ trợ upsert atomic, namespace, TTL, access counter & GIN metadata index.
   - `hermes_task_events`: Event stream append-only phục vụ audit, telemetry và Server-Sent Events (SSE).
2. Xây dựng migration scripts (`.up.sql` / `.down.sql`) và trigger tự động cập nhật `updated_at`.

### 1.2 HERMES-DB-02: PostgreSQL Repositories Layer
Tạo các repository modules chuyên biệt kết nối qua PostgreSQL client (`pg` pool):
1. `src/lib/db/repos/hermesBotRepo.js`:
   - CRUD bots, query theo role, query enabled bots, validate persona & mcpBindings.
2. `src/lib/db/repos/hermesTaskRepo.js`:
   - CRUD Swarm Runs & Tasks.
   - `claimNextTask({ botId, lockDurationMs })`: Sử dụng `FOR UPDATE SKIP LOCKED` tránh tranh chấp lock giữa các worker bots.
   - `updateTaskPheromone(id, delta)`: Tăng/giảm pheromone trail atomic.
   - `recordTaskEvent(data)`: Ghi nhận event và kích hoạt trigger notify.
   - `getEventsByRunId(swarmRunId, { since })`: Lấy sự kiện phục vụ real-time SSE stream.
3. `src/lib/db/repos/hermesMemoryRepo.js`:
   - `setMemory({ swarmRunId, namespace, key, content, metadata, ttl })`: Upsert an toàn bằng `ON CONFLICT DO UPDATE`.
   - `getMemory({ swarmRunId, namespace, key })`: Lấy nội dung knowledge và tăng `access_count` atomic.
   - `clearExpiredMemory()`: Dọn dẹp các memory vượt quá TTL.
   - `decayPheromonesAndMemory(swarmRunId, decayFactor)`: Bay hơi pheromone định kỳ theo chu kỳ đàn kiến.
4. Export toàn bộ repository functions qua `src/lib/db/index.js` hoặc module dedicated `src/lib/db/hermesDb.js`.

### 1.3 HERMES-DB-03: Concurrency, Migration Safety & Data Integrity
1. Sử dụng kết nối PostgreSQL qua biến môi trường `DATABASE_URL` hoặc cấu hình `pg-pool` với reconnect logic tự động.
2. Migration runner tự động chạy khi khởi động nếu bảng chưa tồn tại (`CREATE TABLE IF NOT EXISTS`).
3. Khóa ngoại và ràng buộc toàn vẹn dữ liệu: `ON DELETE CASCADE` cho tasks/events/memory thuộc swarm run, `ON DELETE SET NULL` cho bot references.

---

## 2. Detailed Technical Schema Specifications (PostgreSQL)

### 2.1 Table: `hermes_bots`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT `gen_random_uuid()` | Định danh duy nhất |
| `name` | VARCHAR(255) | NOT NULL UNIQUE | Tên Bot |
| `role` | VARCHAR(50) | NOT NULL CHECK in whitelist | `coordinator`, `worker`, `specialist`, `evaluator`, `synthesizer` |
| `system_prompt` | TEXT | NOT NULL | System prompt của bot |
| `persona` | JSONB | NOT NULL DEFAULT `'{}'` | JSONB tone, capabilities, constraints |
| `combo_id` | VARCHAR(36) | DEFAULT NULL | Model Combo ID liên kết (nếu có) |
| `mcp_bindings` | JSONB | NOT NULL DEFAULT `'[]'` | Danh sách MCP Server IDs hoặc Tool names |
| `enabled` | BOOLEAN | NOT NULL DEFAULT TRUE | Trạng thái kích hoạt |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian tạo |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian cập nhật |

**Indexes:**
- `idx_hermes_bots_name`: UNIQUE on `name`
- `idx_hermes_bots_role`: B-Tree on `role`
- `idx_hermes_bots_enabled`: B-Tree on `enabled`
- `idx_hermes_bots_persona_gin`: GIN on `persona`

---

### 2.2 Table: `hermes_swarm_runs`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT `gen_random_uuid()` | Định danh Swarm Run |
| `name` | VARCHAR(255) | NOT NULL | Tên / tiêu đề run |
| `objective` | TEXT | NOT NULL | Mục tiêu đề bài lớn |
| `orchestrator_bot_id` | UUID | REFERENCES `hermes_bots(id)` ON DELETE SET NULL | Bot điều phối chính |
| `status` | VARCHAR(30) | NOT NULL DEFAULT `'pending'` | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `input` | JSONB | NOT NULL DEFAULT `'{}'` | Input parameters |
| `result` | JSONB | DEFAULT NULL | Kết quả tổng hợp cuối cùng |
| `telemetry` | JSONB | NOT NULL DEFAULT `'{}'` | Thống kê tokens, thời gian chạy, số bước |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian tạo |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian cập nhật |

**Indexes:**
- `idx_hermes_swarm_runs_status`: B-Tree on `status`
- `idx_hermes_swarm_runs_created_at_desc`: B-Tree on `created_at DESC`

---

### 2.3 Table: `hermes_swarm_tasks`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT `gen_random_uuid()` | Định danh Task |
| `swarm_run_id` | UUID | NOT NULL REFERENCES `hermes_swarm_runs(id)` ON DELETE CASCADE | Thuộc Swarm Run |
| `parent_task_id` | UUID | REFERENCES `hermes_swarm_tasks(id)` ON DELETE CASCADE | Task cha (nếu là subtask) |
| `assigned_bot_id` | UUID | REFERENCES `hermes_bots(id)` ON DELETE SET NULL | Bot được gán thực thi |
| `title` | VARCHAR(255) | NOT NULL | Tiêu đề task |
| `description` | TEXT | NOT NULL | Nội dung chi tiết |
| `status` | VARCHAR(30) | NOT NULL DEFAULT `'queued'` | `queued`, `in_progress`, `completed`, `failed`, `blocked` |
| `priority` | INTEGER | NOT NULL DEFAULT 1 CHECK (1..5) | Mức độ ưu tiên |
| `pheromone_strength` | DOUBLE PRECISION | NOT NULL DEFAULT 1.0 CHECK (>= 0.0) | Trọng số trail thuật toán đàn kiến |
| `input` | JSONB | NOT NULL DEFAULT `'{}'` | Input task payload |
| `output` | JSONB | DEFAULT NULL | Output kết quả task |
| `error` | TEXT | DEFAULT NULL | Thông tin lỗi |
| `retry_count` | INTEGER | NOT NULL DEFAULT 0 | Số lần retry |
| `max_retries` | INTEGER | NOT NULL DEFAULT 3 | Số lần retry tối đa |
| `lock_token` | UUID | DEFAULT NULL | Token lease khi worker bot claim task |
| `locked_until` | TIMESTAMPTZ | DEFAULT NULL | Hạn chót lease trước khi task bị timeout/re-queue |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian tạo |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian cập nhật |

**Indexes:**
- `idx_hermes_tasks_swarm_run_id`: B-Tree on `swarm_run_id`
- `idx_hermes_tasks_parent_task_id`: B-Tree on `parent_task_id`
- `idx_hermes_tasks_assigned_bot_id`: B-Tree on `assigned_bot_id`
- `idx_hermes_tasks_queue_schedule`: Partial B-Tree on `(priority DESC, pheromone_strength DESC, created_at ASC) WHERE status = 'queued'`
- `idx_hermes_tasks_lease_recovery`: Partial B-Tree on `(locked_until) WHERE status = 'in_progress'`

---

### 2.4 Table: `hermes_shared_memory`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT `gen_random_uuid()` | Định danh Memory Entry |
| `swarm_run_id` | UUID | REFERENCES `hermes_swarm_runs(id)` ON DELETE CASCADE | Phạm vi Run (NULL = Global) |
| `namespace` | VARCHAR(100) | NOT NULL DEFAULT `'default'` | Phân vùng (e.g. `findings`, `decisions`, `code`) |
| `key` | VARCHAR(255) | NOT NULL | Khóa kiến thức |
| `content` | TEXT | NOT NULL | Nội dung kiến thức |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | JSONB authorBotId, tags, confidence |
| `ttl` | TIMESTAMPTZ | DEFAULT NULL | Thời điểm hết hạn |
| `access_count` | INTEGER | NOT NULL DEFAULT 0 | Số lần truy cập |
| `last_accessed_at` | TIMESTAMPTZ | DEFAULT NULL | Lần truy cập cuối |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian tạo |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian cập nhật |

**Indexes:**
- `idx_hermes_memory_lookup`: UNIQUE NULLS NOT DISTINCT on `(swarm_run_id, namespace, key)`
- `idx_hermes_memory_namespace`: B-Tree on `namespace`
- `idx_hermes_memory_ttl`: B-Tree on `ttl` WHERE ttl IS NOT NULL
- `idx_hermes_memory_metadata_gin`: GIN on `metadata`

---

### 2.5 Table: `hermes_task_events`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY DEFAULT `gen_random_uuid()` | Định danh Event |
| `swarm_run_id` | UUID | NOT NULL REFERENCES `hermes_swarm_runs(id)` ON DELETE CASCADE | Swarm Run liên quan |
| `task_id` | UUID | REFERENCES `hermes_swarm_tasks(id)` ON DELETE CASCADE | Task liên quan (nếu có) |
| `bot_id` | UUID | REFERENCES `hermes_bots(id)` ON DELETE SET NULL | Bot phát sinh |
| `event_type` | VARCHAR(50) | NOT NULL | Loại event |
| `payload` | JSONB | NOT NULL DEFAULT `'{}'` | Chi tiết event |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT `NOW()` | Thời gian ghi nhận |

**Indexes:**
- `idx_hermes_events_swarm_run_ts`: B-Tree on `(swarm_run_id, created_at ASC)`
- `idx_hermes_events_task_id`: B-Tree on `task_id`
- `idx_hermes_events_payload_gin`: GIN on `payload`

---

## 3. Repository Interfaces & Method Signatures

### 3.1 `hermesBotRepo.js`
- `createBot({ name, role, systemPrompt, persona, comboId, mcpBindings, enabled })`
- `getBotById(id)`
- `getBotByName(name)`
- `getBots({ role, enabled, limit, offset })`
- `updateBot(id, data)`
- `deleteBot(id)`

### 3.2 `hermesTaskRepo.js`
- `createSwarmRun(data)` / `getSwarmRunById(id)` / `updateSwarmRun(id, data)` / `deleteSwarmRun(id)`
- `createTask(data)` / `getTaskById(id)` / `getTasksByRunId(swarmRunId, filters)`
- `claimNextTask({ botId, lockDurationMs })`: Atomically lock task bằng `FOR UPDATE SKIP LOCKED`.
- `completeTask(id, { output, pheromoneBoost })`: Đổi trạng thái `completed`, tăng điểm pheromone trail.
- `failTask(id, { error, shouldRetry })`: Ghi nhận lỗi và kích hoạt retry/blocked.
- `updateTaskPheromone(id, delta)`
- `recordTaskEvent(data)` / `getEventsByRunId(swarmRunId, { since })`

### 3.3 `hermesMemoryRepo.js`
- `setMemory({ swarmRunId, namespace, key, content, metadata, ttl })`: Atomic upsert bằng `ON CONFLICT (swarm_run_id, namespace, key) DO UPDATE`.
- `getMemory({ swarmRunId, namespace, key })`: Đọc và tự động tăng `access_count`, cập nhật `last_accessed_at`.
- `listMemory({ swarmRunId, namespace, limit, offset })`
- `deleteMemory({ swarmRunId, namespace, key })`
- `clearExpiredMemory()`
- `decayAllPheromonesAndMemory(decayFactor)`

---

## 4. Verification & Testing Criteria

1. **PostgreSQL Integration Tests (`tests/hermes/postgresDb.test.js`)**:
   - Khởi tạo migration trên test PostgreSQL DB.
   - Kiểm tra ràng buộc Foreign Key `ON DELETE CASCADE` khi xóa Run.
   - Kiểm tra `claimNextTask` khi chạy song song 10 workers giả lập (không trùng task).
   - Kiểm tra atomic upsert và TTL cleanup trong `hermesMemoryRepo`.
   - Kiểm tra trigger `LISTEN/NOTIFY` hoặc event logging.
