# Hướng dẫn sử dụng GSD

## 1. GSD là gì?

GSD (Get Shit Done) là workflow quản lý vòng đời phát triển phần mềm theo cấu trúc:

```text
Định hướng
→ Khám phá / Thu thập
→ Định nghĩa phạm vi
→ Làm rõ phase
→ Lập kế hoạch
→ Thực thi
→ Xác minh
→ Review / Security / UAT
→ Audit milestone
→ Đóng milestone
```

GSD không chỉ tạo kế hoạch. GSD giữ lại context, quyết định, kế hoạch, kết quả thực thi, bằng chứng kiểm thử và trạng thái dự án trong `.planning/`.

Mục tiêu chính:

- Chia feature lớn thành phase có ranh giới rõ.
- Chuyển quyết định mơ hồ thành artifact có thể kiểm tra.
- Tách planning khỏi execution.
- Ghi nhận kết quả bằng `SUMMARY.md`, `VERIFICATION.md`, `UAT.md`.
- Ngăn việc tuyên bố hoàn thành khi thiếu test hoặc thiếu evidence.
- Cho phép tiếp tục sau khi context bị reset hoặc session bị dừng.

---

## 2. Artifact GSD

GSD lưu trạng thái tại `.planning/`.

| Artifact | Mục đích |
|---|---|
| `PROJECT.md` | Mục tiêu, giá trị cốt lõi, phạm vi sản phẩm |
| `config.json` | Cấu hình workflow, model, parallelization, quality gates |
| `REQUIREMENTS.md` | Requirement có ID, phân loại v1/v2/out-of-scope |
| `ROADMAP.md` | Danh sách phase, mục tiêu, dependency, success criteria |
| `STATE.md` | Vị trí hiện tại, quyết định, blocker, tiến độ |
| `CONTEXT.md` | Quyết định implementation đã chốt cho phase |
| `SPEC.md` | Requirement chi tiết, acceptance criteria và boundary của phase |
| `RESEARCH.md` | Kết quả nghiên cứu kỹ thuật trước planning |
| `PLAN.md` | Kế hoạch thực thi chi tiết |
| `SUMMARY.md` | Kết quả sau khi execute plan |
| `VERIFICATION.md` | Kết quả kiểm tra tự động và quality gate |
| `UAT.md` | Kết quả user acceptance testing |
| `SECURITY.md` | Đánh giá threat và mitigation |
| `VALIDATION.md` | Nyquist validation: kiểm tra task có verification tương ứng |
| `*-MILESTONE-AUDIT.md` | Audit toàn milestone |

Cấu trúc phase thông thường:

```text
.planning/
├── PROJECT.md
├── REQUIREMENTS.md
├── ROADMAP.md
├── STATE.md
├── config.json
└── phases/
    └── 04-autonomous-server-side-react-loop/
        ├── 04-SPEC.md
        ├── 04-CONTEXT.md
        ├── 04-RESEARCH.md
        ├── 04-01-PLAN.md
        ├── 04-01-SUMMARY.md
        ├── 04-VERIFICATION.md
        ├── 04-UAT.md
        └── 04-VALIDATION.md
```

`PLAN.md` không thay thế `SUMMARY.md`. Có kế hoạch không đồng nghĩa đã hoàn thành.

---

## 3. Kiểm tra prerequisite trước khi dùng GSD

Chạy từ project root:

```bash
command -v gsd-sdk
gsd-sdk --version
git status --short --branch
```

`gsd-sdk` phải tồn tại trong `PATH`.

Canonical workflow refs:

```text
$HOME/.codex/get-shit-done/
```

Trong môi trường hiện tại, GSD SDK nằm tại:

```text
/home/nguyen-thanh-hung/.local/bin/gsd-sdk
```

Trước khi sửa code hoặc planning artifact, đọc:

```text
CLAUDE.md
AGENTS.md                 # nếu có ở scope liên quan
.hermes.md                # nếu có
.planning/PROJECT.md
.planning/STATE.md
.planning/ROADMAP.md
.planning/REQUIREMENTS.md
```

Nếu làm trong thư mục con, đọc thêm `AGENTS.md` gần thư mục đó. Ví dụ, thay đổi trong `open-sse/` phải đọc:

```text
open-sse/AGENTS.md
```

Không ghi đè thay đổi người dùng đang có. Kiểm tra `git status` trước và sau workflow.

---

## 4. Chọn workflow đúng

### 4.1. `gsd-fast`: việc rất nhỏ

Dùng cho việc:

- Sửa typo.
- Thêm import bị thiếu.
- Đổi một giá trị config.
- Thêm một entry vào `.gitignore`.
- Đổi tên biến đơn giản.
- Commit phần việc đã có sẵn.

Điều kiện:

- Tối đa khoảng 3 file.
- Không thêm dependency.
- Không thay đổi kiến trúc.
- Không cần research.
- Có thể hoàn thành trong khoảng 1–2 phút.

Cú pháp:

```text
$gsd-fast "fix typo in README"
$gsd-fast "add .env to gitignore"
```

Workflow:

```text
Đọc file
→ Sửa
→ Sanity check / test nhỏ
→ Commit atomic
→ Ghi STATE.md nếu có bảng Quick Tasks
```

Không dùng `gsd-fast` cho feature, bug phức tạp, thay đổi schema, API contract, security hoặc nhiều module.

### 4.2. `gsd-quick`: task nhỏ nhưng cần tracking

Dùng khi task không đủ lớn để thành phase nhưng cần:

- PLAN.md.
- Executor.
- Atomic commit.
- Tracking trong `STATE.md`.
- Khả năng resume.

```text
$gsd-quick "add retry policy to MCP JSON-RPC client"
```

Các mode:

```text
$gsd-quick --discuss "..."    # làm rõ assumption trước planning
$gsd-quick --research "..."   # nghiên cứu approach trước planning
$gsd-quick --validate "..."   # plan-check và verification
$gsd-quick --full "..."       # discuss + research + plan-check + verify
```

Task lưu trong:

```text
.planning/quick/YYYYMMDD-slug/
```

Xem task:

```text
$gsd-quick list
$gsd-quick status <slug>
$gsd-quick resume <slug>
```

### 4.3. Phase workflow: feature hoặc thay đổi material

Dùng khi có một hoặc nhiều tiêu chí sau:

- Nhiều file hoặc nhiều module.
- Thay đổi architecture.
- Thay đổi DB schema hoặc migration.
- Thay đổi API contract.
- Feature có nhiều acceptance criteria.
- Cần nhiều plan và nhiều wave.
- Cần integration, security, UAT.
- Thay đổi ảnh hưởng nhiều phase.

Luồng đầy đủ:

```text
$gsd-spec-phase <phase>
$gsd-discuss-phase <phase>
$gsd-plan-phase <phase>
$gsd-execute-phase <phase>
$gsd-verify-work <phase>
```

Không phải phase nào cũng cần chạy cả `spec-phase` và `discuss-phase`. Chọn theo mức độ mơ hồ:

| Tình trạng | Lệnh |
|---|---|
| Chưa rõ phase phải deliver gì | `$gsd-spec-phase <N>` |
| Biết deliver gì nhưng chưa rõ approach | `$gsd-discuss-phase <N>` |
| Scope và approach đã rõ | `$gsd-plan-phase <N>` |

### 4.4. `gsd-debug`: bug

Dùng debugging workflow, không sửa đoán:

```text
$gsd-debug "MCP process manager gọi sai repository method"
```

Chỉ chẩn đoán, chưa sửa:

```text
$gsd-debug --diagnose "request bị treo khi upstream trả tool call"
```

Quản lý debug session:

```text
$gsd-debug list
$gsd-debug status <slug>
$gsd-debug continue <slug>
```

Luồng debug:

```text
Symptom
→ Evidence
→ Hypothesis
→ Experiment
→ Root cause
→ Fix
→ Regression test
→ Verification
```

---

## 5. Khởi tạo project mới

### 5.1. Project mới hoàn toàn

```text
$gsd-new-project
```

Workflow gồm:

1. Hỏi để hiểu sản phẩm.
2. Research domain nếu cần.
3. Chia scope v1, v2 và out-of-scope.
4. Tạo requirements có ID.
5. Tạo roadmap theo phase.
6. Tạo state ban đầu.

Artifact tạo ra:

```text
.planning/PROJECT.md
.planning/config.json
.planning/REQUIREMENTS.md
.planning/ROADMAP.md
.planning/STATE.md
```

Nếu đã có PRD rõ:

```text
$gsd-new-project --auto
```

Chỉ dùng `--auto` khi input và acceptance criteria đủ rõ. Với sản phẩm chưa rõ scope, dùng mode tương tác.

### 5.2. Repo có sẵn

Map codebase trước:

```text
$gsd-map-codebase
```

Có thể giới hạn:

```text
$gsd-map-codebase --fast
$gsd-map-codebase --focus "MCP process manager"
$gsd-map-codebase --query "tool injection"
```

Sau đó dùng project workflow.

### 5.3. Milestone mới

Khi project đã có nhưng muốn bắt đầu version/cycle mới:

```text
$gsd-new-milestone "v1.1 API Management"
```

Workflow cập nhật:

```text
.planning/PROJECT.md
.planning/REQUIREMENTS.md
.planning/ROADMAP.md
.planning/STATE.md
```

Không dùng `gsd-new-project` để mở milestone trên project đã tồn tại.

---

## 6. Làm rõ phase

### 6.1. `gsd-spec-phase`: khóa WHAT

Dùng khi requirement hoặc acceptance criteria còn mơ hồ:

```text
$gsd-spec-phase 4
```

Workflow:

1. Đọc `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`.
2. Scout codebase.
3. Hỏi theo vòng Socratic.
4. Chấm ambiguity theo các dimension.
5. Chỉ tạo `SPEC.md` khi ambiguity đạt gate.
6. Commit artifact.

Tùy chọn:

```text
$gsd-spec-phase 4 --auto
$gsd-spec-phase 4 --text
```

`SPEC.md` phải trả lời:

- Phase này deliver gì?
- Người dùng hoặc hệ thống quan sát được gì?
- Acceptance criteria là gì?
- Boundary với phase khác ở đâu?
- Điều gì nằm ngoài scope?
- Failure behavior là gì?

### 6.2. `gsd-discuss-phase`: khóa DECISIONS

```text
$gsd-discuss-phase 4
```

Workflow:

1. Load context trước đó.
2. Scout pattern hiện có.
3. Tìm gray areas.
4. Cho người dùng chọn topic cần thảo luận.
5. Chốt từng quyết định.
6. Ghi deferred ideas để tránh scope creep.
7. Tạo `04-CONTEXT.md`.

Các mode hữu ích:

```text
$gsd-discuss-phase 4 --assumptions
$gsd-discuss-phase 4 --analyze
$gsd-discuss-phase 4 --power
$gsd-discuss-phase 4 --batch
$gsd-discuss-phase 4 --text
```

`CONTEXT.md` cần chứa quyết định cụ thể. Tránh ghi câu mơ hồ như:

```text
Làm cho hệ thống tốt hơn.
Tối ưu performance.
Hỗ trợ đầy đủ mọi format.
```

Nên ghi:

```text
MAX_ITERATIONS = 10.
Intermediate streaming turns được buffer.
Client-native tools không bị chặn bởi server-side MCP loop.
```

### 6.3. UI phase

Nếu phase có frontend/dashboard, cần cân nhắc UI contract trước planning:

```text
$gsd-ui-phase <N>
```

Sau implementation:

```text
$gsd-ui-review <N>
```

UI review tập trung vào layout, hierarchy, states, interaction, responsive và accessibility.

---

## 7. Lập kế hoạch phase

```text
$gsd-plan-phase 4
```

Planner đọc:

```text
PROJECT.md
REQUIREMENTS.md
ROADMAP.md
STATE.md
CONTEXT.md
SPEC.md
RESEARCH.md
codebase docs
```

Tạo một hoặc nhiều plan:

```text
04-01-PLAN.md
04-02-PLAN.md
04-03-PLAN.md
```

Các option:

```text
$gsd-plan-phase 4 --research
$gsd-plan-phase 4 --skip-research
$gsd-plan-phase 4 --research-phase 4
$gsd-plan-phase 4 --research-phase 4 --view
$gsd-plan-phase 4 --tdd
$gsd-plan-phase 4 --mvp
$gsd-plan-phase 4 --gaps
$gsd-plan-phase 4 --skip-verify
```

Ý nghĩa:

- `--research`: refresh technical research.
- `--skip-research`: bỏ researcher khi domain đã rõ.
- `--research-phase`: chỉ research, chưa tạo plan.
- `--view`: xem `RESEARCH.md` hiện có.
- `--tdd`: sắp xếp plan theo test-first.
- `--mvp`: lập kế hoạch vertical MVP.
- `--gaps`: chỉ plan phần gap từ UAT hoặc verifier.
- `--skip-verify`: bỏ plan checker; chỉ dùng khi có lý do rõ.

Một plan tốt phải có:

- Objective có thể kiểm tra.
- Task cụ thể, không phải danh sách mong muốn.
- File sẽ tạo/sửa.
- Dependency giữa task.
- Wave phù hợp.
- Expected behavior.
- Verification command hoặc manual check.
- Success criteria.
- Không chứa credential hoặc secret.

Ví dụ task yếu:

```text
Cải thiện MCP loop.
```

Ví dụ task đủ cụ thể:

```text
Tạo open-sse/mcp/toolLoop.js.
Phân loại tool call theo prefix mcp__.
Gọi processManager.executeToolCall(serverName, toolName, args).
Chèn tool result theo sourceFormat.
Dừng khi hết gateway tool call hoặc đạt MAX_ITERATIONS = 10.
Thêm unit test cho mixed gateway/client-native calls.
```

---

## 8. Thực thi plan

```text
$gsd-execute-phase 4
```

GSD:

1. Đọc `STATE.md`.
2. Tìm plan chưa có `SUMMARY.md`.
3. Nhóm plan theo wave.
4. Kiểm tra overlap trong `files_modified`.
5. Chạy wave theo thứ tự.
6. Executor sửa code, chạy test, commit.
7. Tạo `SUMMARY.md`.
8. Cập nhật state và roadmap.
9. Chạy verifier sau phase.

Chạy wave cụ thể:

```text
$gsd-execute-phase 4 --wave 1
$gsd-execute-phase 4 --wave 2
```

Chỉ chạy gap closure:

```text
$gsd-execute-phase 4 --gaps-only
```

Trước execute, kiểm tra dirty tree:

```bash
git status --short
```

Nếu có thay đổi chưa commit của người dùng, không tự ý reset, stash hoặc revert. Xác định phạm vi thay đổi trước.

Sau execute, kiểm tra:

```bash
git status --short --branch
git log --oneline -10
```

Một plan chỉ được coi là executed khi có đủ:

```text
Code change
+ Test/sanity check
+ Commit
+ SUMMARY.md
+ State update
```

Nếu agent dừng giữa chừng, không chạy lại mù. Kiểm tra commit và file trước; tránh duplicate implementation.

---

## 9. Verify và UAT

### 9.1. Verification phase

```text
$gsd-verify-work 4
```

Verification cần đối chiếu:

- Phase goal.
- Requirement IDs.
- Success criteria.
- Plan outputs.
- Test evidence.
- Integration với phase trước/sau.
- Failure mode.
- Regression risk.

### 9.2. UAT

UAT kiểm tra behavior người dùng quan sát được. GSD trình bày từng checkpoint:

```text
Expected: Khi LLM gọi mcp__server__tool, gateway thực thi tool,
chèn tool_result và trả final answer.

Reality matches?
```

Phản hồi hợp lệ:

```text
yes
pass
next
skip
blocked
<mô tả issue>
```

Issue được ghi vào `UAT.md` với severity. Sau đó plan gap:

```text
$gsd-plan-phase 4 --gaps
$gsd-execute-phase 4 --gaps-only
$gsd-verify-work 4
```

UAT không thay thế automated test. Hai loại evidence bổ sung cho nhau.

### 9.3. Nyquist validation

```text
$gsd-validate-phase 4
```

Mục tiêu: mỗi behavior quan trọng có verification tương ứng. Phase có code nhưng thiếu test/check sẽ bị đánh dấu thiếu coverage.

### 9.4. Code review

```text
$gsd-code-review 4
```

Review source changed trong phase, tập trung vào:

- Correctness.
- Security.
- Error handling.
- Regression.
- Convention.
- Dead code, stub, TODO không có kế hoạch.

### 9.5. Security review

```text
$gsd-secure-phase 4
```

Dùng cho phase có:

- Authentication/authorization.
- Credential hoặc secret.
- Process spawning.
- Network/SSRF.
- File system.
- DB migration.
- Input parsing.
- Tool execution.

---

## 10. Theo dõi và resume

Báo cáo tiến độ:

```text
$gsd-progress
```

Báo cáo kèm integrity audit:

```text
$gsd-progress --forensic
```

Tự đi bước kế:

```text
$gsd-progress --next
```

`--next` route theo artifact thật:

```text
Không có planning structure
→ new-project

Phase chưa có context/research
→ discuss-phase

Phase có context nhưng chưa có plan
→ plan-phase

Có plan chưa có summary
→ execute-phase

Tất cả plan có summary
→ verify-work

Phase xong, còn phase sau
→ discuss phase kế tiếp

Tất cả phase xong
→ complete-milestone
```

Dùng `--next --force` chỉ khi đã đọc và chấp nhận safety gate bị bỏ qua.

Route free-form:

```text
$gsd-progress --do "fix the MCP cache persistence bug"
$gsd-progress --do "start a new milestone for dashboard API"
```

Resume sau session bị dừng:

```text
$gsd-resume-work
```

Pause có handoff:

```text
$gsd-pause-work
$gsd-pause-work --report
```

Khi pause, giữ lại:

- Current phase/plan.
- Đã làm gì.
- Chưa làm gì.
- File đang thay đổi.
- Test đã chạy.
- Blocker.
- Bước tiếp theo.

---

## 11. Capture ý tưởng và todo

Capture task từ conversation:

```text
$gsd-capture "add real SQLite to inbound injection integration test"
```

Capture note nhanh:

```text
$gsd-capture --note "investigate MCP tool timeout behavior"
```

Xem todo:

```text
$gsd-capture --list
$gsd-capture --list api
```

Ý tưởng chưa đủ rõ để đưa vào phase nên đi qua `capture` hoặc `explore`, không nhét trực tiếp vào plan đang chạy.

---

## 12. Quản lý phase và milestone

Thêm phase cuối roadmap:

```text
$gsd-phase "Add admin dashboard"
```

Chèn phase giữa hai phase:

```text
$gsd-phase --insert 4 "Fix critical process manager contract"
```

Xóa future phase:

```text
$gsd-phase --remove 7
```

Lệnh xóa phase là destructive. Chỉ chạy sau khi xác nhận phase chưa bắt đầu và scope xóa đúng.

Sửa metadata phase:

```text
$gsd-phase --edit 4
```

Phase đã bắt đầu cần thận trọng khi sửa roadmap. Không sửa để che kết quả đã ship.

---

## 13. Audit milestone

Sau khi các phase hoàn thành:

```text
$gsd-audit-milestone
```

Audit đối chiếu ba nguồn requirement:

```text
REQUIREMENTS.md
SUMMARY.md frontmatter
VERIFICATION.md
```

Requirement chỉ được coi là satisfied khi có evidence phù hợp. Checkbox `[x]` trong `REQUIREMENTS.md` một mình không đủ.

Audit kiểm tra:

- Requirement coverage.
- Phase verification.
- Cross-phase integration.
- E2E flow.
- UAT debt.
- Nyquist compliance.
- Security debt.
- Orphan requirement.

Kết quả:

```yaml
status: passed
```

hoặc:

```yaml
status: gaps_found
```

Nếu có gap, không chạy complete milestone ngay. Tạo closure phase hoặc chạy validation/security retroactive nếu có thể đóng gap mà không cần code mới.

---

## 14. Đóng milestone

Chỉ đóng khi:

- Tất cả phase có plan hoàn chỉnh.
- Tất cả plan có summary.
- Verification không còn failure chưa xử lý.
- Requirement đã có evidence.
- Audit milestone đạt `passed`, hoặc người dùng xác nhận chấp nhận gap như tech debt.

Lệnh:

```text
$gsd-complete-milestone 1.0
```

Workflow thực hiện:

1. Audit open artifacts.
2. Kiểm tra phase và requirement readiness.
3. Thu thập stats.
4. Trích xuất accomplishments.
5. Archive roadmap.
6. Archive requirements.
7. Evolve `PROJECT.md`.
8. Tạo commit archive.
9. Tạo git tag.
10. Đề xuất milestone tiếp theo.

Artifact archive:

```text
.planning/milestones/v1.0-ROADMAP.md
.planning/milestones/v1.0-REQUIREMENTS.md
```

Không tự động push tag hoặc deploy production. Push/deploy là thao tác riêng, cần xác nhận scope và target.

---

## 15. Luồng khuyến nghị cho feature lớn

Dùng sequence này:

```text
1. $gsd-progress
2. Đọc PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md
3. $gsd-spec-phase <N>              # nếu WHAT còn mơ hồ
4. $gsd-discuss-phase <N>           # khóa approach và boundary
5. $gsd-plan-phase <N> --research
6. $gsd-execute-phase <N>
7. $gsd-verify-work <N>
8. $gsd-code-review <N>
9. $gsd-secure-phase <N>            # nếu có security surface
10. $gsd-validate-phase <N>
11. Sửa gap nếu có
12. $gsd-progress --forensic
13. Lặp lại phase kế tiếp
14. $gsd-audit-milestone
15. $gsd-complete-milestone <version>
```

Không cần chạy `spec-phase` nếu acceptance criteria đã được khóa bởi PRD/ADR. Khi có PRD hoặc ADR, có thể dùng express path:

```text
$gsd-plan-phase <N> --prd path/to/requirements.md
$gsd-plan-phase <N> --ingest path/to/adr.md
```

Không kết hợp `--prd` và `--ingest` trong cùng một lần.

---

## 16. Luồng khuyến nghị cho bug

```text
1. $gsd-progress
2. $gsd-debug "mô tả symptom và expected behavior"
3. Thu thập evidence
4. Xác nhận root cause
5. Tạo fix hoặc plan fix
6. Thêm regression test
7. Chạy test liên quan
8. Chạy baseline nếu đụng provider/alias/OAuth
9. Review diff
10. Cập nhật STATE.md / SUMMARY.md nếu bug thuộc phase
```

Với bug nhỏ, dùng:

```text
$gsd-quick --validate "fix ..."
```

Không dùng patch đoán chỉ dựa trên stack trace nếu chưa xác định root cause.

---

## 17. Luồng khuyến nghị cho repo 9router hiện tại

Project hiện tại có:

```text
.planning/PROJECT.md
.planning/ROADMAP.md
.planning/REQUIREMENTS.md
.planning/STATE.md
```

Vị trí state:

```text
Phase 4 — Autonomous Server-Side ReAct Loop
Context gathered
Ready for planning
```

Context phase:

```text
.planning/phases/04-autonomous-server-side-react-loop/04-CONTEXT.md
```

Bước hợp lệ tiếp theo:

```text
$gsd-plan-phase 4
```

Sau planning:

```text
$gsd-execute-phase 4
$gsd-verify-work 4
$gsd-code-review 4
$gsd-secure-phase 4
$gsd-validate-phase 4
```

Các quyết định Phase 4 đã có:

- ReAct loop nằm trong `open-sse/mcp/toolLoop.js`.
- Điều phối qua `open-sse/handlers/chatCore.js`.
- Intermediate streaming turns được buffer.
- Prefix `mcp__*` là gateway MCP tool.
- Client-native tools được trả về client.
- Mixed calls xử lý MCP trước.
- Tool result dùng native `sourceFormat`.
- `MAX_ITERATIONS = 10`.
- Error dùng soft landing qua final LLM turn.
- Token usage cộng dồn qua các turn.

Audit milestone hiện tại đang có gap:

```text
.planning/v1.0-MILESTONE-AUDIT.md
status: gaps_found
```

Vì vậy chưa chạy:

```text
$gsd-complete-milestone 1.0
```

Audit đang ghi nhận thiếu verification và integration ở các khu vực Phase 1, Phase 2, Phase 4, Phase 5, Phase 6 và Phase 7. Sau khi hoàn thành từng phase, phải tạo evidence tương ứng trước khi audit lại.

---

## 18. Safety gates bắt buộc

### Không tự ý destructive cleanup

Cần xác nhận trước khi:

- Xóa phase hoặc artifact.
- Xóa requirement.
- Reset/revert thay đổi người dùng.
- `git reset --hard`.
- Force push.
- Rewrite history.
- Xóa DB hoặc migration data.
- Đổi credential.
- Deploy production.

### Không in secret

Không đọc hoặc in:

```text
.env
.env.* có credential
private key
API token
cookie
credential store
```

Có thể đọc contract của env trong `.env.example`, nhưng không in giá trị secret thật.

### Không tin artifact mù quáng

`STATE.md`, `ROADMAP.md`, `SUMMARY.md` là context quan trọng nhưng vẫn phải đối chiếu với:

```text
git diff
git log
file thực tế
test output
verification evidence
```

Checkbox hoặc status trong planning file không tự chứng minh code đã chạy.

### Không dùng `--force` mặc định

`--force` có thể bỏ qua safety gate. Chỉ dùng khi:

1. Đã đọc lý do gate.
2. Xác nhận state không bị hỏng.
3. Ghi nhận lý do override.
4. Có verification bù lại.

---

## 19. Checklist trước khi báo hoàn thành

### Scope

- [ ] Đúng project và đúng phase.
- [ ] Requirement IDs đã map.
- [ ] Scope không bị mở rộng ngoài roadmap.
- [ ] Deferred ideas đã ghi lại.

### Code

- [ ] File thay đổi đúng `files_modified` hoặc deviation đã ghi.
- [ ] Không có secret trong diff.
- [ ] Không có stub hoặc TODO mới không có lý do.
- [ ] Convention của repo được giữ.

### Test

- [ ] Test liên quan đã chạy thật.
- [ ] Test result có output.
- [ ] Baseline đã chạy nếu đụng provider/alias/OAuth.
- [ ] Expected failures được phân biệt với regression mới.
- [ ] UAT đã hoàn tất hoặc blocker có lý do.

### GSD artifacts

- [ ] `PLAN.md` tồn tại.
- [ ] `SUMMARY.md` tồn tại.
- [ ] `VERIFICATION.md` tồn tại khi phase đã execute.
- [ ] `REQUIREMENTS.md` phản ánh evidence thật.
- [ ] `STATE.md` phản ánh vị trí mới.
- [ ] `ROADMAP.md` phản ánh phase status.

### Git

- [ ] `git status` đã kiểm tra.
- [ ] Commit atomic, message đúng convention.
- [ ] Không stage file không liên quan.
- [ ] Không force push.

Chỉ báo “hoàn thành” sau khi các mục acceptance criteria và verification đều có bằng chứng.

---

## 20. Bảng nhớ nhanh

| Câu hỏi | Lệnh |
|---|---|
| Project đang ở đâu? | `$gsd-progress` |
| Bước kế tiếp là gì? | `$gsd-progress --next` |
| Việc cực nhỏ? | `$gsd-fast "..."` |
| Task nhỏ cần tracking? | `$gsd-quick "..."` |
| Bug? | `$gsd-debug "..."` |
| WHAT chưa rõ? | `$gsd-spec-phase <N>` |
| Approach chưa rõ? | `$gsd-discuss-phase <N>` |
| Tạo plan? | `$gsd-plan-phase <N>` |
| Chạy plan? | `$gsd-execute-phase <N>` |
| Verify behavior? | `$gsd-verify-work <N>` |
| Validate coverage? | `$gsd-validate-phase <N>` |
| Review code? | `$gsd-code-review <N>` |
| Review security? | `$gsd-secure-phase <N>` |
| Audit milestone? | `$gsd-audit-milestone` |
| Đóng milestone? | `$gsd-complete-milestone <version>` |
| Dừng an toàn? | `$gsd-pause-work` |
| Tiếp tục? | `$gsd-resume-work` |

Luồng mặc định cần nhớ:

```text
progress
→ discuss/spec
→ plan
→ execute
→ verify
→ review
→ audit
→ complete
```

---

## 21. Canonical references

GSD command reference:

```text
$HOME/.codex/get-shit-done/workflows/help.md
```

GSD workflow refs:

```text
$HOME/.codex/get-shit-done/workflows/
```

Project context:

```text
CLAUDE.md
.planning/PROJECT.md
.planning/ROADMAP.md
.planning/REQUIREMENTS.md
.planning/STATE.md
```

Repo testing guide:

```text
.planning/codebase/TESTING.md
```

Repo architecture guide:

```text
docs/ARCHITECTURE.md
```
