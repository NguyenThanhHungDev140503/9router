# Tài liệu Luồng Kỹ thuật: Hệ thống Tìm kiếm & Điều phối MCP Tool & Skills (In-Memory BM25 Index)

Tài liệu này giải thích chi tiết luồng kỹ thuật (Technical Flow) cho cơ chế tìm kiếm, xếp hạng và điều phối công cụ MCP và Custom Skills vào request payload dựa trên **In-Memory BM25 Index (MiniSearch)** và **Explicit Fast-Path** trong **9router**.

---

## 1. Bức tranh Tổng quan (High-Level Architecture)

### 1.1. Mục tiêu & Vấn đề giải quyết
- **Thay thế:** Cơ chế duyệt mảng và substring matching cứng (`String.prototype.includes()`) thiếu chính xác và tốn token.
- **Mục tiêu:**
  - Định tuyến chính xác tuyệt đối khi người dùng nhắc tên rõ ràng (`$skill-name`, `@server-name`).
  - Chấm điểm ngữ nghĩa từ vựng (BM25 scoring) với trọng số boost đa tầng (`triggers` > `keywords` > `name` > `description`).
  - Cắt giảm ngân sách token: Chỉ tiêm Top-K liên quan nhất (Top 5 tools, Top 3 skills thay vì tiêm 30 tools).
  - Độ trễ dưới mili-giây (`< 1ms`) trong bộ nhớ RAM, zero network latency, fail-open an toàn.

### 1.2. Sơ đồ Luồng Tổng thể (End-to-End Pipeline Flow)

```
[ Request từ Client ] (OpenAI / Claude / Gemini)
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. USER PROMPT EXTRACTION & NORMALIZATION (`tokenizer.js`)            │
│    - Trích xuất user messages từ payload                               │
│    - Chuẩn hóa Unicode (NFKC), lower-case, tách tokens & stop-words    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
┌───────────────────────────────────┐ ┌──────────────────────────────────┐
│ 2A. FAST-PATH EXPLICIT MATCHER    │ │ 2B. BM25 RANKING SEARCH          │
│     (`explicitMatcher.js`)        │ │     (`toolIndex.js`)             │
│ - Quét cú pháp:                   │ │ - Query MiniSearch Inverted      │
│   + `$([a-zA-Z0-9_-]+)` (Skill)   │ │   Index                          │
│   + `@([a-zA-Z0-9_-]+)` (Server)  │ │ - Field Boosting:                │
│ - Khớp chính xác tên              │ │   triggers(4x) > keywords(3x) >  │
│ - Gán điểm: Score = 999 (Top 1)   │ │   name(2x) > description(1x)     │
│                                   │ │ - Fuzzy typo & prefix matching   │
│                                   │ │ - Lọc: score >= minScore (1.5)   │
└─────────────────┬─────────────────┘ └──────────────────┬───────────────┘
                  │                                      │
                  └─────────────────┬────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. SELECTION ORCHESTRATOR & MODE FILTERING (`inboundSelection.js`)     │
│    - Merge kết quả từ Fast-Path + BM25 Ranking                         │
│    - Áp dụng Activation Mode:                                          │
│      + ALWAYS   : Gán điểm tối đa (1000)                               │
│      + DISABLED : Bỏ qua                                               │
│      + AUTO     : Chỉ lấy nếu vượt qua 2A hoặc 2B                      │
│    - Áp dụng Header Override: lọc theo `x-mcp-servers`                 │
│    - Token Budget Slicing: Lấy Top-5 Tools, Top-3 Skills               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. FORMAT-AWARE INJECTION (`inboundInjectionPipeline.js`)              │
│    - Tiêm Tool Schema: OpenAI `function` / Claude `input_schema` /     │
│      Gemini `functionDeclarations`                                     │
│    - Tiêm Skill Prompt: Nối tiếp vào system prompt                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
[ Upstream LLM Request ] (Gọn nhẹ, đúng trọng tâm, tiết kiệm token)
```

---

## 2. Cấu trúc Module & Dữ liệu (Components & Data Schema)

### 2.1. Phân chia Module (`open-sse/mcp/search/`)
| Module | File | Trách nhiệm |
|---|---|---|
| **Tokenizer** | `tokenizer.js` | Trích xuất text từ request, chuẩn hóa Unicode, loại bỏ stop-words. |
| **Explicit Matcher** | `explicitMatcher.js` | Quét regex `$skill` và `@server`, khớp trực tiếp danh sách active. |
| **Search Index** | `toolIndex.js` | Quản lý in-memory `MiniSearch` instance, build index, atomic swap. |
| **Selection Orchestrator** | `inboundSelection.js` | Điều phối matching, tính toán ranking, lọc mode và header. |
| **Injection Pipeline** | `inboundInjectionPipeline.js` | Tiêm schema và prompt vào request body. |

### 2.2. Schema Tài liệu Index (`SearchDocument`)
Mỗi Tool và Skill được chuẩn hóa thành 1 Document phẳng trong bộ nhớ:

```typescript
interface SearchDocument {
  id: string;             // "tool:<serverId>:<toolName>" hoặc "skill:<skillId>"
  type: "tool" | "skill"; // Phân loại tài nguyên
  serverId?: string;      // ID server chứa tool (nếu là tool)
  name: string;           // Tên công cụ / tên skill
  triggers: string;       // Chuỗi gộp các alias/trigger lệnh
  keywords: string;       // Chuỗi gộp các từ khóa phân loại
  description: string;    // Mô tả chi tiết tính năng
  raw: object;            // Raw tool schema hoặc skill entity gốc
}
```

---

## 3. Luồng Kỹ thuật Chi tiết Từng Bước (Step-by-Step Flow)

### Bước 1: Trích xuất & Chuẩn hóa Prompt (Tokenization)
1. `inboundSelection.js` nhận `body` và `sourceFormat`.
2. Gọi `extractUserPromptText(sourceFormat, body)` để lấy toàn bộ chuỗi text từ các user messages.
3. Chạy qua `normalizeText()`:
   - Áp dụng Unicode Normalization `NFKC`.
   - Hạ về chữ thường `.toLocaleLowerCase()`.
   - Lọc ký tự đặc biệt, chuẩn hóa khoảng trắng.

### Bước 2: Phân luồng So khớp Song song (Matching Stage)
1. **Luồng Fast-Path (`explicitMatcher.js`):**
   - Quét regex `/\$([a-zA-Z0-9_-]+)/g` để tìm tên Skill.
   - Quét regex pattern `/@([a-zA-Z0-9_-]+)/g` để tìm tên Server.
   - Nếu phát hiện ID hoặc Alias khớp $\rightarrow$ Đưa ngay vào danh sách ưu tiên với `score = 999`.
2. **Luồng BM25 Search (`toolIndex.js`):**
   - MiniSearch thực hiện truy vấn trên Inverted Index với cấu hình:
     ```javascript
     const searchOptions = {
       fields: ['triggers', 'keywords', 'name', 'description'],
       boost: { triggers: 4.0, keywords: 3.0, name: 2.0, description: 1.0 },
       fuzzy: (term) => (term.length > 4 ? 0.2 : false),
       prefix: true,
       combineWith: 'OR'
     };
     ```
   - Chấm điểm từng document theo thuật toán BM25 / TF-IDF.
   - Lọc bỏ các kết quả có `score < MIN_SCORE_THRESHOLD` (ngưỡng 1.5).

### Bước 3: Hợp nhất, Lọc Mode & Cắt Ngân sách (Selection & Budgeting)
1. **Định tuyến theo Activation Mode:**
   - `ALWAYS`: Luôn gán `score = 1000` (bắt buộc nạp).
   - `DISABLED`: Loại bỏ khỏi danh sách.
   - `AUTO`: Chỉ nhận nếu có kết quả từ Fast-Path hoặc BM25 score đạt chuẩn.
2. **Lọc theo Header `x-mcp-servers`:**
   - Nếu client gửi kèm header này, toàn bộ tool không thuộc các server được liệt kê sẽ bị loại.
3. **Giới hạn Ngân sách (Top-K Slicing):**
   - Sắp xếp toàn bộ ứng viên theo `score` giảm dần.
   - Lấy tối đa **5 MCP Tools** (`MAX_INJECTED_TOOLS = 5`).
   - Lấy tối đa **3 Custom Skills** (`MAX_INJECTED_SKILLS = 3`).

### Bước 4: Tiêm Payload & Fail-Open Boundary
1. Tiêm Tools vào mảng `tools` theo format của provider upstream (OpenAI, Claude, Gemini).
2. Tiêm Skills vào `system` message theo cơ chế ghép nối tiếp (Append).
3. **Biên an toàn (Fail-Open):** Toàn bộ pipeline bọc trong `try/catch`. Nếu index bị lỗi hoặc có ngoại lệ bất ngờ, hệ thống ghi log cảnh báo và trả về body nguyên bản cho Upstream LLM xử lý tiếp, không ngắt request.

---

## 4. Quản lý Vòng đời & Cơ chế Đồng bộ (Lifecycle & Sync)

```
[ Khởi động Server (Cold Start) ]
               │
               ▼
   `ToolIndexManager.init()`
   - Đọc toàn bộ SQLite DB: `mcpServers`, `mcpToolsCache`, `skills`
   - Build MiniSearch Index trong RAM (~10-20ms)
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ TRẠNG THÁI RUNTIME (In-Memory MiniSearch Instance)          │
└──────────────────────────────┬──────────────────────────────┘
                               │
            Có cập nhật DB từ API / Web Dashboard
   (Thêm Server, Sửa Skill, Toggle Enabled, Sync Tool Cache)
                               │
                               ▼
   `ToolIndexManager.rebuild()`
   - Async query SQLite lấy snapshot mới
   - Tạo instance MiniSearch mới
   - Atomic swap reference (`currentIndex = newIndex`)
   - Zero-downtime, non-blocking các request đang search
```

---

## 5. Bảng So sánh Hiệu năng & Chất lượng

| Tiêu chí | Cơ chế cũ (`String.includes`) | Cơ chế mới (MiniSearch BM25 Index) |
|---|---|---|
| **Độ trễ truy vấn** | ~0.5ms (Duyệt vòng lặp N*M) | **< 0.2ms** (Inverted index RAM) |
| **Độ chính xác (Precision)** | Thấp (Khớp nhầm từ ngắn, trượt câu dài) | **Rất cao** (TF-IDF + Boost trường + Typo tolerance) |
| **Lệnh trực tiếp ($skill, @server)** | Khớp chuỗi mơ hồ | **Fast-path tuyệt đối (100% Hit)** |
| **Token context tiêu thụ** | Tiêm tối đa 30 tools (lãng phí token) | **Chỉ tiêm 3 - 5 tools liên quan nhất** |
| **Độ thông minh của LLM** | Dễ bị hallucinate vì quá nhiều tools thừa | **Tập trung cao độ vào công cụ đúng mục đích** |

---

## 6. Hướng dẫn Kiểm thử (Testing Matrix)

1. **Unit Tests (`test/mcp/toolIndex.test.js`):**
   - Test khởi tạo index và đồng bộ dữ liệu.
   - Test trọng số boost: Từ khóa trong `triggers` phải có score cao hơn `description`.
   - Test fuzzy search với từ bị gõ sai (VD: `"databse"` $\rightarrow$ khớp `"database"`).
2. **Unit Tests (`test/mcp/explicitMatcher.test.js`):**
   - Test nhận diện `$skill-name` và `@server-name` ở đầu, giữa và cuối prompt.
3. **Integration Tests (`test/mcp/inboundSelection.test.js`):**
   - Test kết hợp Fast-path + BM25 + Mode filter.
   - Test giới hạn Top-5 tools và Top-3 skills.
   - Test tính năng Fail-open khi DB hoặc payload rỗng.
