---
phase: "08"
phase_name: "Database Schema & Hermes Repositories"
milestone: "v2.0"
created_at: "2026-08-24T21:40:00.000Z"
requirements:
  - HERMES-DB-01
  - HERMES-DB-02
  - HERMES-DB-03
---

# Phase 8 Spec: Database Schema & Hermes Repositories

## Overview & Goal
Thiết lập nền tảng lưu trữ SQLite và tầng truy xuất dữ liệu (Data Access Layer / Repositories) cho toàn bộ hệ sinh thái **Hermes Gateway & Ant Colony Swarm Intelligence** trong 9Router. Cung cấp schema định nghĩa bảng, chỉ mục (indexes), cơ chế auto-migration an toàn và các repository methods chuẩn hóa để quản lý Bots, Tasks, Shared Memory Blackboard, Swarm Runs và Task Events.

---

## 1. Functional Scope & Requirements Mapping

### 1.1 HERMES-DB-01: Hermes Tables in Database Schema
Cập nhật `src/lib/db/schema.js` định nghĩa 5 bảng chính cùng các index tối ưu truy vấn:
1. `hermes_bots`: Quản lý danh tính, vai trò (role), system prompt, persona, model combo binding, mcp bindings, và trạng thái enabled.
2. `hermes_swarm_tasks`: Quản lý các task phân tán trong swarm (parentTaskId, swarmRunId, assignedBotId, status, priority, pheromoneStrength, input/output payload, retry metadata).
3. `hermes_shared_memory`: Bảng lưu trữ Collective Knowledge Blackboard (key, namespace/category, content, metadata, ttl, accessCount, lastAccessedAt).
4. `hermes_swarm_runs`: Quản lý vòng đời chạy swarm cấp cao (objective, orchestratorBotId, status, result, telemetry, timestamps).
5. `hermes_task_events`: Nhật ký sự kiện chi tiết của từng task (taskId, swarmRunId, botId, eventType, payload, createdAt) phục vụ audit, telemetry và SSE stream.

### 1.2 HERMES-DB-02: Repository Modules
Tạo mới các repository modules trong `src/lib/db/repos/`:
1. `src/lib/db/repos/hermesBotRepo.js`: CRUD Bot, query theo role, filter enabled bots, validate payload.
2. `src/lib/db/repos/hermesTaskRepo.js`: CRUD Tasks, query theo runId / status, update status/output/pheromone, query child tasks, CRUD Swarm Runs, CRUD Task Events.
3. `src/lib/db/repos/hermesMemoryRepo.js`: Get/Set/Delete blackboard memory, namespace queries, TTL check & cleanup, atomic access counter & decay helpers.
4. Export toàn bộ repository methods từ `src/lib/db/index.js` tuân thủ kiến trúc hiện tại của 9Router.

### 1.3 HERMES-DB-03: Zero-Downtime Auto-Migration & Data Integrity
1. Schema builder trong `src/lib/db/schema.js` và `src/lib/db/index.js` tự động khởi tạo các bảng và index mới khi khởi động ứng dụng mà không gây lỗi hoặc làm gián đoạn các bảng hiện có (`mcpServers`, `skills`, `combos`, `settings`, v.v.).
2. Serialization / Deserialization dữ liệu JSON an toàn thông qua helper `src/lib/db/helpers/jsonCol.js` (`parseJson`, `stringifyJson`).
3. Khóa ngoại logic (Logical Foreign Keys) và index hỗ trợ truy vấn quan hệ: `swarmRunId`, `parentTaskId`, `assignedBotId`.

---

## 2. Detailed Technical Schema Design

### 2.1 Table: `hermes_bots`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL UNIQUE | Tên định danh của Bot |
| `role` | TEXT | NOT NULL | Vai trò: `coordinator`, `worker`, `specialist`, `evaluator`, `synthesizer` |
| `systemPrompt` | TEXT | NOT NULL | Prompt định nghĩa hành vi và chuyên môn của bot |
| `persona` | TEXT | DEFAULT `'{}'` | JSON metadata: tone, capabilities, constraints |
| `comboId` | TEXT | DEFAULT NULL | Model Combo ID sử dụng cho Bot (nếu chỉ định) |
| `mcpBindings` | TEXT | DEFAULT `'[]'` | JSON array các MCP server ID hoặc Tool names bot được phép gọi |
| `enabled` | INTEGER | NOT NULL DEFAULT 1 | 1: Active, 0: Disabled |
| `createdAt` | TEXT | NOT NULL | ISO 8601 Timestamp |
| `updatedAt` | TEXT | NOT NULL | ISO 8601 Timestamp |

**Indexes:**
- `idx_hermes_bots_name`: UNIQUE on `name`
- `idx_hermes_bots_role`: INDEX on `role`
- `idx_hermes_bots_enabled`: INDEX on `enabled`

---

### 2.2 Table: `hermes_swarm_runs`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | Tên định danh / mô tả ngắn của swarm run |
| `objective` | TEXT | NOT NULL | Mục tiêu / đề bài lớn cần hoàn thành |
| `orchestratorBotId` | TEXT | DEFAULT NULL | Bot chịu trách nhiệm lập kế hoạch phân rã |
| `status` | TEXT | NOT NULL DEFAULT `'pending'` | Trạng thái: `pending`, `running`, `completed`, `failed`, `cancelled` |
| `input` | TEXT | DEFAULT `'{}'` | JSON input payload |
| `result` | TEXT | DEFAULT NULL | JSON output kết quả cuối cùng |
| `telemetry` | TEXT | DEFAULT `'{}'` | JSON tổng hợp metrics (tokens, executionTimeMs, totalTasks) |
| `createdAt` | TEXT | NOT NULL | ISO 8601 Timestamp |
| `updatedAt` | TEXT | NOT NULL | ISO 8601 Timestamp |

**Indexes:**
- `idx_hermes_swarm_runs_status`: INDEX on `status`
- `idx_hermes_swarm_runs_createdAt`: INDEX on `createdAt DESC`

---

### 2.3 Table: `hermes_swarm_tasks`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `swarmRunId` | TEXT | NOT NULL | Thuộc về Swarm Run nào |
| `parentTaskId` | TEXT | DEFAULT NULL | Task cha (nếu là subtask phân rã) |
| `assignedBotId` | TEXT | DEFAULT NULL | Bot được gán thực thi task |
| `title` | TEXT | NOT NULL | Tiêu đề task |
| `description` | TEXT | NOT NULL | Chi tiết yêu cầu công việc |
| `status` | TEXT | NOT NULL DEFAULT `'queued'` | Trạng thái: `queued`, `in_progress`, `completed`, `failed`, `blocked` |
| `priority` | INTEGER | NOT NULL DEFAULT 1 | Độ ưu tiên (1: Normal, 2: High, 3: Critical) |
| `pheromoneStrength` | REAL | NOT NULL DEFAULT 1.0 | Trọng số pheromone của Ant Colony trail |
| `input` | TEXT | DEFAULT `'{}'` | JSON dữ liệu đầu vào của task |
| `output` | TEXT | DEFAULT NULL | JSON kết quả thực thi của task |
| `error` | TEXT | DEFAULT NULL | Thông tin lỗi nếu task thất bại |
| `retryCount` | INTEGER | NOT NULL DEFAULT 0 | Số lần đã retry |
| `maxRetries` | INTEGER | NOT NULL DEFAULT 3 | Giới hạn retry tối đa |
| `createdAt` | TEXT | NOT NULL | ISO 8601 Timestamp |
| `updatedAt` | TEXT | NOT NULL | ISO 8601 Timestamp |

**Indexes:**
- `idx_hermes_tasks_swarmRunId`: INDEX on `swarmRunId`
- `idx_hermes_tasks_parentTaskId`: INDEX on `parentTaskId`
- `idx_hermes_tasks_assignedBotId`: INDEX on `assignedBotId`
- `idx_hermes_tasks_status`: INDEX on `status`
- `idx_hermes_tasks_pheromone`: INDEX on `pheromoneStrength DESC`

---

### 2.4 Table: `hermes_shared_memory`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `swarmRunId` | TEXT | DEFAULT NULL | Phạm vi theo Swarm Run (NULL = Global memory) |
| `namespace` | TEXT | NOT NULL DEFAULT `'default'` | Phân loại / domain (e.g. `findings`, `decisions`, `code_snippets`) |
| `key` | TEXT | NOT NULL | Tên khóa định danh |
| `content` | TEXT | NOT NULL | Nội dung kiến thức lưu trữ (String hoặc JSON payload) |
| `metadata` | TEXT | DEFAULT `'{}'` | JSON metadata: authorBotId, tags, confidence score |
| `ttl` | INTEGER | DEFAULT NULL | Thời gian sống tính bằng epoch ms (hoặc NULL nếu vô hạn) |
| `accessCount` | INTEGER | NOT NULL DEFAULT 0 | Số lần các bot đọc/truy cập |
| `lastAccessedAt` | TEXT | DEFAULT NULL | ISO 8601 Timestamp lần truy cập gần nhất |
| `createdAt` | TEXT | NOT NULL | ISO 8601 Timestamp |
| `updatedAt` | TEXT | NOT NULL | ISO 8601 Timestamp |

**Indexes:**
- `idx_hermes_memory_lookup`: UNIQUE on `(swarmRunId, namespace, key)`
- `idx_hermes_memory_namespace`: INDEX on `namespace`
- `idx_hermes_memory_ttl`: INDEX on `ttl`

---

### 2.5 Table: `hermes_task_events`
| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `swarmRunId` | TEXT | NOT NULL | Swarm Run liên quan |
| `taskId` | TEXT | DEFAULT NULL | Task liên quan (nếu có) |
| `botId` | TEXT | DEFAULT NULL | Bot phát sinh sự kiện |
| `eventType` | TEXT | NOT NULL | Loại sự kiện (`task_assigned`, `execution_started`, `tool_called`, `pheromone_updated`, `task_completed`, `task_failed`, `memory_written`) |
| `payload` | TEXT | DEFAULT `'{}'` | JSON payload chi tiết sự kiện |
| `createdAt` | TEXT | NOT NULL | ISO 8601 Timestamp |

**Indexes:**
- `idx_hermes_events_swarmRunId`: INDEX on `swarmRunId, createdAt ASC`
- `idx_hermes_events_taskId`: INDEX on `taskId`

---

## 3. Repository Interfaces & Method Signatures

### 3.1 `hermesBotRepo.js`
- `createBot(data)`: Tạo mới bot với validation đầy đủ (name, role, systemPrompt).
- `getBotById(id)`: Lấy bot theo ID, parse JSON (`persona`, `mcpBindings`).
- `getBotByName(name)`: Lấy bot theo tên.
- `getBots({ role, enabled, limit, offset } = {})`: Lấy danh sách bots theo bộ lọc.
- `updateBot(id, data)`: Cập nhật thông tin bot.
- `deleteBot(id)`: Xóa bot theo ID.
- `countBots({ role, enabled } = {})`: Đếm số lượng bot thỏa mãn điều kiện.

### 3.2 `hermesTaskRepo.js`
**Swarm Runs:**
- `createSwarmRun(data)`: Tạo swarm run mới.
- `getSwarmRunById(id)`: Lấy chi tiết swarm run.
- `getSwarmRuns({ status, limit, offset } = {})`: Lấy danh sách swarm runs sắp xếp theo `createdAt DESC`.
- `updateSwarmRun(id, data)`: Cập nhật status, result, telemetry, updatedAt.
- `deleteSwarmRun(id)`: Xóa swarm run và các task/events liên quan.

**Swarm Tasks:**
- `createTask(data)`: Tạo mới task thuộc về `swarmRunId`.
- `getTaskById(id)`: Lấy task theo ID.
- `getTasksByRunId(swarmRunId, { status, assignedBotId, parentTaskId } = {})`: Lấy danh sách tasks trong run.
- `getPendingTasks({ limit, minPriority } = {})`: Lấy các task đang ở trạng thái `queued` sắp xếp theo `priority DESC, pheromoneStrength DESC, createdAt ASC`.
- `updateTask(id, data)`: Cập nhật status, output, error, retryCount, pheromoneStrength.
- `updateTaskPheromone(id, delta)`: Tăng/giảm giá trị `pheromoneStrength` một cách atomic.
- `deleteTask(id)`: Xóa task theo ID.

**Task Events:**
- `recordTaskEvent(data)`: Ghi nhận event mới (`swarmRunId`, `taskId`, `botId`, `eventType`, `payload`).
- `getEventsByRunId(swarmRunId, { limit, since } = {})`: Lấy danh sách sự kiện phục vụ telemetry / SSE timeline.

### 3.3 `hermesMemoryRepo.js`
- `setMemory({ swarmRunId, namespace, key, content, metadata, ttl })`: Lưu hoặc ghi đè key (Upsert).
- `getMemory({ swarmRunId, namespace, key })`: Đọc key, đồng thời atomic tăng `accessCount` và cập nhật `lastAccessedAt`.
- `listMemory({ swarmRunId, namespace, limit, offset } = {})`: Liệt kê các key trong namespace.
- `deleteMemory({ swarmRunId, namespace, key })`: Xóa key khỏi blackboard.
- `clearExpiredMemory()`: Xóa các bản ghi có `ttl IS NOT NULL AND ttl < ?` (current timestamp ms).
- `decayAllPheromonesAndMemory(decayFactor)`: Helper hỗ trợ Ant Colony cycle.

---

## 4. Verification & Testing Criteria

1. **Unit & Integration Tests (`tests/hermes/db.test.js` or `tests/db/hermesRepo.test.js`)**:
   - Khởi tạo DB SQLite in-memory / test-file, kiểm tra auto-migration tạo đầy đủ 5 bảng và các indexes.
   - Test CRUD trọn vẹn `hermesBotRepo` (validation lỗi khi thiếu field, parse persona, mcpBindings).
   - Test CRUD trọn vẹn `hermesTaskRepo` (Swarm run, parent-child tasks, atomic pheromone update, task events log).
   - Test CRUD trọn vẹn `hermesMemoryRepo` (Upsert memory, TTL expiry, atomic access counter).
2. **Backward Compatibility**:
   - Chạy test suite hiện tại (`npm test`) đảm bảo không ảnh hưởng tới `mcpServers`, `skills`, `combos`, `usageDaily`, v.v.
