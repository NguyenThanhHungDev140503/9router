# Requirements: Milestone v2.0 Hermes Gateway & Ant Colony Swarm Intelligence

## Traceability Matrix

| Requirement ID | Name | Description | Status |
|---|---|---|---|
| HERMES-DB-01 | Hermes Schema Definition | Bảng `hermes_bots`, `hermes_swarm_tasks`, `hermes_shared_memory`, `hermes_swarm_runs` với foreign keys và indexes | Proposed |
| HERMES-DB-02 | Hermes Bot & Task Repositories | Repositories CRUD cho Hermes Bots, Swarm Tasks, Runs và Task Events | Proposed |
| HERMES-DB-03 | Shared Memory Repository | CRUD và tìm kiếm full-text (FTS/Semantic) trong bộ nhớ chia sẻ tập thể | Proposed |
| HERMES-BOT-01 | Bot Configuration & Profile | Thiết lập profile cho từng bot: Name, Role, Model, Provider, Temperature, System Prompt | Proposed |
| HERMES-BOT-02 | Tool & Skill Binding | Gán tập MCP Servers, Tools, và Custom Skills chuyên biệt cho từng bot | Proposed |
| HERMES-BOT-03 | Bot Execution Context | Tạo execution context và nạp đúng ReAct Loop + Model Gateway của 9Router cho từng bot | Proposed |
| HERMES-MEM-01 | Collective Knowledge Blackboard | Cơ chế Publish-Subscribe / Write-Read kiến thức giữa các bot trong phiên làm việc | Proposed |
| HERMES-MEM-02 | Context Synthesis & Recall | Bot tự động truy vấn và chèn tri thức liên quan từ các bot khác vào prompt của mình | Proposed |
| HERMES-SWARM-01 | Task Decomposition & Branching | Phân rã bài toán lớn thành nhiều nhánh khám phá song song cho các specialized bot | Proposed |
| HERMES-SWARM-02 | Pheromone / Score Evaluation | Đánh giá tiến độ, chất lượng và confidence score của từng nhánh khám phá | Proposed |
| HERMES-SWARM-03 | Optimal Path Convergence | Tự động phát hiện nhánh tối ưu, dừng các nhánh phụ và điều hướng đàn bot tập trung khai thác sâu | Proposed |
| HERMES-SWARM-04 | Final Synthesis & Answer Delivery | Orchestrator tổng hợp toàn bộ kết quả từ đàn bot thành câu trả lời hoàn chỉnh cuối cùng | Proposed |
| HERMES-API-01 | Hermes Bots REST APIs | CRUD endpoints cho danh sách bot và cấu hình (`/api/hermes/bots`) | Proposed |
| HERMES-API-02 | Swarm Task & Execution APIs | Endpoints tạo task, kích hoạt swarm run, kiểm tra trạng thái (`/api/hermes/swarm`) | Proposed |
| HERMES-API-03 | Real-time Swarm SSE Stream | Endpoint stream real-time nhật ký khám phá, tin nhắn giữa các bot và trạng thái hội tụ (`/api/hermes/swarm/[id]/stream`) | Proposed |
| HERMES-UI-01 | Hermes Bot Roster Management | Giao diện quản lý danh sách bot, gắn model/provider, MCP tools và custom skills | Proposed |
| HERMES-UI-02 | Swarm Task Launcher & Monitor | Form khởi tạo task bầy đàn và bảng theo dõi các swarm tasks đang chạy | Proposed |
| HERMES-UI-03 | Ant Colony Live Visualizer | Đồ thị mạng lưới trực quan hiển thị các nhánh khám phá, tín hiệu pheromone và điểm hội tụ | Proposed |
| HERMES-TEST-01 | Multi-Agent Unit Tests | Unit tests cho Hermes Bot execution, Shared Memory Hub và Repositories | Proposed |
| HERMES-TEST-02 | Swarm Convergence & E2E Tests | E2E simulation test quy trình đàn kiến: Phân rã -> Khám phá song song -> Phát hiện nhánh tối ưu -> Hội tụ | Proposed |

## Milestone Scope
- **Target**: v2.0
- **Total Requirements**: 20
- **Phases Planned**: 6 (Phase 8 đến Phase 13 tiếp nối Milestone v1.0)
