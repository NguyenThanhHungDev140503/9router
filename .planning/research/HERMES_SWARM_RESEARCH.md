# Research: Hermes Gateway & Ant Colony Swarm Intelligence on 9Router

## 1. Hermes Gateway Architecture Overview
- **Hermes Agent Framework (NousResearch)**: Kiến trúc agent hỗ trợ messaging gateway đa nền tảng, tool-calling, kỹ năng (skills), persistent memory, và self-evolution.
- **Gateway Protocol**: Quản lý session, phân phối bản tin, dispatching tool calls, và multi-agent coordination.
- **Micro-Agent Specialization**: Mỗi Hermes Bot là một agent chuyên biệt (Specialized Agent):
  - Model & Provider riêng (e.g. Claude 3.7 Sonnet cho Reasoning, DeepSeek-V3 cho Coding, Gemini 2.0 Flash cho Fast Web Search/Research).
  - Tập MCP Servers & Tools riêng (e.g. Browser/Scraper, Code Analyzer, Knowledge Graph, Shell/Terminal).
  - System Prompts & Skill sets riêng biệt.

## 2. Ant Colony / Swarm Intelligence Pattern (Mô hình Đàn Kiến)
1. **Parallel Exploration (Tung đàn kiến mở đường)**:
   - Khi Orchestrator nhận task phức tạp, nó phân rã và kích hoạt nhiều Hermes Bot song song theo các hướng giả thuyết/chiến lược khác nhau (breadth-first + heuristic search).
   - Mỗi bot ghi lại "vết pheromone" (findings, confidence score, execution logs) vào Shared Knowledge Blackboard.
2. **Pheromone Trail & Optimal Path Detection**:
   - Khi một bot phát hiện lời giải hoặc nhánh kết quả vượt trội (đạt confidence threshold / validation criteria), Orchestrator lập tức đánh dấu đây là **Optimal Path**.
3. **Swarm Convergence (Hội tụ đàn kiến)**:
   - Orchestrator gửi tín hiệu điều hướng (Re-route / Broadcast context) tới tất cả các bot còn lại.
   - Các bot đang ở các nhánh kém tối ưu sẽ dừng hoặc chuyển hướng nguồn lực sang khai thác sâu (Exploitation) trên con đường tối ưu vừa tìm được.
4. **Collective Memory & Cross-Bot Knowledge Sharing**:
   - Dùng SQLite Repository trung tâm (kèm Vector / FTS search) lưu trữ kiến thức tập thể.
   - Bot A tìm được insight mới -> lưu vào Shared Memory -> Bot B tự động nhận context liên quan khi thực thi.

## 3. Integration Points on 9Router
- **Database Schema**: Bảng `hermes_bots`, `hermes_swarm_tasks`, `hermes_shared_memory`, `hermes_swarm_runs`.
- **Core Orchestrator**: `src/lib/hermes/swarmOrchestrator.js`, `src/lib/hermes/botManager.js`, `src/lib/hermes/memoryHub.js`.
- **SSE & ChatCore Integration**: Khả năng chuyển tiếp query từ user thành Swarm Run, stream real-time progress của từng bot về Web UI / Client.
- **REST APIs & Dashboard UI**: Quản lý đàn bot, cấu hình profile (Model, MCP, Skills), và Swarm Visualizer (xem đàn kiến đang khám phá).
