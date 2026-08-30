# 9Router: Hermes Gateway & Ant Colony Swarm Intelligence (v2.0)

## What This Is
Hệ sinh thái Multi-Agent Hermes Gateway và Swarm Intelligence (Trí tuệ đàn kiến) tích hợp trực tiếp trên 9Router. Cho phép thiết lập mạng lưới các Hermes Bot chuyên biệt (sở hữu Model, Provider, MCP Tools, Skills riêng) phối hợp khám phá song song đa nhánh nhiệm vụ, tự động chia sẻ kiến thức tập thể và hội tụ theo đường dẫn tối ưu (Optimal Path Convergence) được điều phối bởi Orchestrator.

## Core Value
Biến 9Router thành trạm điều phối Swarm Intelligence trung tâm:
1. **Specialized Hermes Bots**: Mỗi bot có đặc tính, prompt, kỹ năng, MCP servers và model/provider tối ưu riêng (ví dụ: Researcher Bot, Coder Bot, Fact-Checker Bot, Architect Bot).
2. **Ant Colony Swarm Search**: Khi nhận nhiệm vụ nghiên cứu/xử lý, đàn bot đồng loạt bung ra khám phá mọi giả thuyết song song. Khi một bot tìm thấy hướng đi khả thi/tối ưu nhất, Orchestrator lập tức điều hướng toàn bộ đàn kiến tập trung khai thác và hoàn thiện theo hướng đó.
3. **Shared Knowledge Blackboard**: Bộ nhớ chia sẻ tập thể (Shared SQLite Memory + Full-Text Search / Embeddings) giúp các bot bổ sung kiến thức cho nhau trong thời gian thực.
4. **Interactive Swarm Dashboard**: Giao diện trực quan hóa đàn bot, tiến trình tìm kiếm, vết pheromone (confidence scores), và cây quyết định hội tụ.

## Prior Milestones
- **v1.0 Server-Side MCP & Skills Gateway** (Phases 1-7 completed): Quản lý MCP Servers, Tools Cache, Custom Skills, Inbound Injection, Autonomous Server-Side ReAct Loop, REST APIs, Web Dashboard UI, và Comprehensive Test Suite.

## Milestone v2.0 Scope & Requirements

### Active
- [ ] **HERMES-DB**: Schema SQLite cho `hermes_bots`, `hermes_swarm_tasks`, `hermes_shared_memory`, `hermes_swarm_runs`
- [ ] **HERMES-BOT**: Quản lý vòng đời Hermes Bot (Config, Provider/Model Binding, Tool/MCP Assignment, System Prompt & Skill binding)
- [ ] **HERMES-MEM**: Hệ thống Shared Memory & Knowledge Graph Hub chia sẻ tri thức real-time giữa các bot
- [ ] **HERMES-SWARM**: Swarm Orchestrator điều phối khám phá song song (Parallel Exploration), chấm điểm heuristics / pheromone, và kích hoạt hội tụ (Optimal Path Convergence)
- [ ] **HERMES-API**: REST API endpoints quản lý đàn bot, khởi tạo swarm task, truy vấn cây khám phá và stream kết quả
- [ ] **HERMES-UI**: Giao diện Swarm Studio trên Dashboard: Cấu hình Bot, Quản lý Swarm, và Visualizer thời gian thực cho mạng lưới bot
- [ ] **HERMES-TEST**: Bộ kiểm thử tự động cho Multi-Agent Swarm, Cross-Bot Knowledge Sharing và Convergence Logic

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Micro-Agents Swarm Architecture | Tận dụng sẵn hạ tầng 9Router (Provider Gateway, MCP Manager, ReAct Loop) để chạy các Hermes Bot độc lập | Adopted |
| Ant Colony Exploration & Convergence | Khám phá song song đa hướng giải quyết vấn đề phức tạp nhanh chóng và tránh kẹt tại local optima | Adopted |
| Shared Memory Blackboard | Các bot học hỏi kinh nghiệm lẫn nhau tức thì thay vì chạy độc lập cô lập | Adopted |

---
*Milestone v2.0 initialized: 2026-08-24*
