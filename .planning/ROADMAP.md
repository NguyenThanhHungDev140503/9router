# Roadmap: 9Router Multi-Agent Hermes Gateway & Swarm Intelligence

## Milestones
- **v1.0 Server-Side MCP & Skills Gateway** (Phases 1-7, Complete)
- **v2.0 Hermes Gateway & Ant Colony Swarm Intelligence** (Phases 8-13, In Progress)

---

## Milestone v2.0 Phase Overview

| Phase | Name | Goal | Requirements | Success Criteria |
|---|---|---|---|---|
| 8 | Database Schema & Hermes Repositories | Khởi tạo bảng SQLite và Repositories cho Hermes Bots, Tasks, Runs, Shared Memory | HERMES-DB-01, HERMES-DB-02, HERMES-DB-03 | 3 |
| 9 | Hermes Bot Engine & Specialization Manager | Xây dựng bộ máy thực thi từng Bot (Model/Provider binding, MCP Tools, Skills) | HERMES-BOT-01, HERMES-BOT-02, HERMES-BOT-03 | 3 |
| 10 | Shared Memory & Collective Knowledge Blackboard | Cơ chế chia sẻ tri thức tập thể thời gian thực giữa các bot | HERMES-MEM-01, HERMES-MEM-02 | 2 |
| 11 | Swarm Orchestrator & Ant Colony Convergence | Cơ chế phân rã nhánh, chấm điểm heuristics/pheromone và điều hướng hội tụ | HERMES-SWARM-01, HERMES-SWARM-02, HERMES-SWARM-03, HERMES-SWARM-04 | 4 |
| 12 | REST APIs & Real-time Swarm SSE Stream | API quản lý Bots, Swarm Runs, và kênh SSE stream diễn biến đàn kiến | HERMES-API-01, HERMES-API-02, HERMES-API-03 | 3 |
| 13 | Swarm Studio Dashboard & E2E Verification | Giao diện Dashboard trực quan hóa đàn kiến, cấu hình Bot và bộ E2E Test Suite | HERMES-UI-01, HERMES-UI-02, HERMES-UI-03, HERMES-TEST-01, HERMES-TEST-02 | 5 |

---

### Phase 8: Database Schema & Hermes Repositories
**Goal:** Thiết lập nền tảng lưu trữ SQLite cho hệ thống Hermes Gateway và Swarm.
**Requirements:** HERMES-DB-01, HERMES-DB-02, HERMES-DB-03
**Success Criteria:**
1. Cập nhật `src/lib/db/schema.js` với các bảng `hermes_bots`, `hermes_swarm_tasks`, `hermes_shared_memory`, `hermes_swarm_runs`, `hermes_task_events`.
2. Tạo `src/lib/db/repos/hermesBotRepo.js`, `src/lib/db/repos/hermesTaskRepo.js`, `src/lib/db/repos/hermesMemoryRepo.js`.
3. Auto-migration hoạt động ổn định và giữ nguyên tính toàn vẹn dữ liệu.

### Phase 9: Hermes Bot Engine & Specialization Manager
**Goal:** Quản lý vòng đời và khả năng thực thi của từng Hermes Bot chuyên biệt.
**Requirements:** HERMES-BOT-01, HERMES-BOT-02, HERMES-BOT-03
**Success Criteria:**
1. Module `src/lib/hermes/botManager.js` khởi tạo và cấu hình Bot theo Profile (Model, Provider, System Prompt).
2. Tự động nạp đúng danh sách MCP Tools và Skills được chỉ định cho từng Bot.
3. Kích hoạt ReAct Loop độc lập trên 9Router Gateway cho từng Bot.

### Phase 10: Shared Memory & Collective Knowledge Blackboard
**Goal:** Xây dựng hệ thống bộ nhớ chia sẻ tập thể (Shared Blackboard) kết nối toàn bộ đàn bot.
**Requirements:** HERMES-MEM-01, HERMES-MEM-02
**Success Criteria:**
1. Module `src/lib/hermes/memoryHub.js` cho phép các bot publish discovery, insights và query tri thức liên quan.
2. Hỗ trợ FTS / Semantic indexing để tìm kiếm nhanh các phát hiện liên quan giữa các bot trong cùng task.
3. Tự động tiêm các kiến thức mới phát hiện vào prompt của bot kế tiếp.

### Phase 11: Swarm Orchestrator & Ant Colony Convergence
**Goal:** Xây dựng bộ não điều phối bầy đàn (Ant Colony Optimization & Optimal Path Convergence).
**Requirements:** HERMES-SWARM-01, HERMES-SWARM-02, HERMES-SWARM-03, HERMES-SWARM-04
**Success Criteria:**
1. Module `src/lib/hermes/swarmOrchestrator.js` phân rã task thành các nhánh tìm kiếm song song cho đàn bot.
2. Thuật toán chấm điểm Pheromone / Confidence Score trên từng nhánh kết quả của bot.
3. Cơ chế Convergence: Khi một bot đạt điểm tối ưu, Orchestrator lập tức dừng các nhánh yếu và điều hướng toàn bộ các bot còn lại hội tụ đào sâu giải pháp tối ưu.
4. Tổng hợp (Synthesize) kết quả cuối cùng từ toàn bộ đàn bot.

### Phase 12: REST APIs & Real-time Swarm SSE Stream
**Goal:** Cung cấp API quản lý và kênh SSE truyền trực tiếp diễn biến hoạt động của đàn bot.
**Requirements:** HERMES-API-01, HERMES-API-02, HERMES-API-03
**Success Criteria:**
1. API `/api/hermes/bots` (GET, POST, PUT, DELETE) quản lý danh sách bot.
2. API `/api/hermes/swarm/tasks` tạo và điều khiển task.
3. API SSE `/api/hermes/swarm/[id]/stream` stream thời gian thực từng bước suy nghĩ, tool call, chia sẻ bộ nhớ và quá trình hội tụ của đàn bot.

### Phase 13: Swarm Studio Dashboard & E2E Verification
**Goal:** Xây dựng giao diện trực quan hóa đàn kiến trên Dashboard và viết bộ test suite tự động hoàn chỉnh.
**Requirements:** HERMES-UI-01, HERMES-UI-02, HERMES-UI-03, HERMES-TEST-01, HERMES-TEST-02
**Success Criteria:**
1. Trang Dashboard Swarm Studio: Quản lý Roster Bot, Khởi tạo nhiệm vụ, và Live Graph Visualizer mạng lưới đàn kiến.
2. Hiển thị trực quan vết Pheromone và quá trình hội tụ nhánh tối ưu trên UI.
3. Bộ Unit Tests và E2E Simulation Test cho quy trình Swarm Intelligence chạy thành công 100%.
