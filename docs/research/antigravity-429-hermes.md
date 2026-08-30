# Nguyên nhân HTTP 429 khi Hermes gọi `antigravity/gemini-3.7-flash-high` qua 9Router

- Status: complete
- Scope: Dò luồng request Hermes → 9Router → Antigravity/Google, phân biệt quota upstream, cooldown nội bộ 9Router, retry, account pool, reset và cách kiểm tra an toàn.
- Date: 2026-08-22

## Executive findings

- **Nguyên nhân có khả năng nhất:** quota/rate limit phía Antigravity/Google gắn với Google OAuth connection/project/model, không phải quota nội bộ Hermes. Google xác nhận `429 RESOURCE_EXHAUSTED` có thể do vượt RPM/TPM/RPD hoặc spend limit; giới hạn áp dụng theo project và thay đổi theo model/tier.[12] 9Router dùng endpoint `v1internal` của Cloud Code/Antigravity và map `gemini-3.7-flash-high` thành upstream `gemini-3.7-flash-tiered(high)`, nên đây không phải direct Gemini API key route.[4]
- **Không đủ bằng chứng để kết luận quota cụ thể đã cạn:** chưa có response body/header 429 thực tế, `Retry-After`, message `reset after ...`, connection ID, project ID hoặc log upstream. Báo cáo này phân biệt khả năng; không khẳng định quota đã hết.
- 9Router **không phải nguồn gốc của upstream HTTP 429**. Nó khóa account/model trong DB rồi chọn account khác; khi tất cả connection bị khóa, có thể trả lại status lỗi cuối cùng (kể cả `429`) hoặc `503`, kèm `Retry-After` tính từ lock sớm nhất. [src/sse/handlers/chat.js:227-243](https://github.com/NguyenThanhHungDev140503/9router/blob/master/src/sse/handlers/chat.js#L227-L243); [src/sse/services/auth.js:79-113](https://github.com/NguyenThanhHungDev140503/9router/blob/master/src/sse/services/auth.js#L79-L113)
- Antigravity executor retry status `429` tối đa 3 lần theo registry. Nó ưu tiên `Retry-After`, `X-RateLimit-Reset-After`, `X-RateLimit-Reset`, hoặc chuỗi `reset after 2h7m23s`; retry hint dài hơn 10 giây bị veto, sau đó request trả lỗi để tầng account fallback xử lý. [providers/registry/antigravity.js:27-36](https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/providers/registry/antigravity.js#L27-L36); [executors/antigravity.js:335-425](https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/executors/antigravity.js#L335-L425)
- 9Router khóa **riêng model trên từng connection** bằng `modelLock_gemini-3.7-flash-high`, không khóa toàn bộ account nếu upstream chỉ báo lỗi model-specific. HTTP 429 không có reset timestamp dùng exponential backoff nội bộ: bắt đầu 2 giây, tối đa 5 phút, tối đa 15 cấp. [services/accountFallback.js:105-149](https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/services/accountFallback.js#L105-L149); [config/errorConfig.js:31-42](https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/config/errorConfig.js#L31-L42)
- Hermes có cơ chế riêng: credential pool xoay nhiều credential cùng provider; docs mô tả retry cùng key một lần cho transient 429, sau 429 thứ hai xoay key, rồi mới fallback provider khi pool cạn. Pool Hermes và account pool 9Router là **hai lớp khác nhau**, không đồng bộ trạng thái cooldown.[14][15]
- Model này là model registry Antigravity hiện có trong checkout và có test quota parser; test chỉ chứng minh parser nhận `remainingFraction`/`resetTime`, không chứng minh quota upstream live còn đủ.[4][11]

## Evidence

### Codebase

- Route `handleChat()` lấy `modelStr`, tìm combo hoặc single model, sau đó gọi `handleSingleModelChat()`.[7]
- `handleSingleModelChat()` gọi `getProviderCredentials(provider, excludeConnectionIds, model)`. Connection có `modelLock_<model>` đang hoạt động bị bỏ qua; nếu mọi connection bị lock, route trả unavailable với thời điểm reset sớm nhất.[8]
- Sau khi 9Router chọn connection, `handleChatCore()` thực thi upstream. Response lỗi được parse, giữ status/message và optional `resetsAtMs`; sau đó `markAccountUnavailable()` lưu lock và vòng lặp chuyển sang connection tiếp theo.[7][8]
- `ERROR_RULES` nhận diện text `rate limit`, `too many requests`, `quota exceeded`, `capacity`, `overloaded`, hoặc status `429`; các rule này dùng backoff. Backoff base là 2 giây, cap 5 phút, cap 15 levels; lỗi không khớp dùng cooldown transient 30 giây.[2]
- `markAccountUnavailable()` ưu tiên reset timestamp do provider cung cấp nhưng hard-cap reset provider ở 30 phút; nếu không có reset dùng `checkFallbackError()`. Lock được ghi vào `modelLock_<model>`, riêng GitHub monthly quota mới dùng account-wide lock; Antigravity 429 bình thường không đi nhánh GitHub.[8]
- Khi request thành công, callback `onRequestSuccess` gọi `clearAccountError()`, xóa lock model vừa thành công và lock đã hết hạn; nếu không còn lock hoạt động thì đặt connection về active, xóa error và reset backoff.[8]
- Antigravity registry đánh dấu provider `deprecated: true`/`RISK_NOTICE`, dùng OAuth, base URL `ANTIGRAVITY_IDE_BASE_URL`, retry `429: attempts: 3`, quota discovery `cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`, và model mapping `gemini-3.7-flash-high` → `gemini-3.7-flash-tiered(high)`.[4]
- Antigravity executor gửi Bearer OAuth tới `streamGenerateContent?alt=sse` hoặc `generateContent`; model này đi qua body Cloud Code có `project`, `model`, `request`.[5]
- Executor retry đọc các header retry/reset; nếu body chứa `reset after ...` thì parse thời gian. Hint >10 giây không retry tại executor; status 429 không có hint dùng exponential delay tối đa 10 giây cho executor.[5]
- 9Router usage handler gọi `loadCodeAssist` để lấy project/tier, rồi `fetchAvailableModels` để đọc `quotaInfo.remainingFraction` và `quotaInfo.resetTime`; nó lọc danh sách model quan trọng, gồm `gemini-3.7-flash-high`.[9] Dashboard test dùng `remainingFraction: 0.85` và `resetTime`, nhưng đó là fixture, không phải trạng thái tài khoản hiện tại.[11]
- MITM path có host rewrite `cloudcode-pa.googleapis.com` → `daily-cloudcode-pa.googleapis.com` vì comment trong source ghi PROD Cloud Code bị 429 còn daily endpoint chấp nhận cùng body/token. Đây là hành vi path MITM riêng; registry/usage path vẫn dùng PROD quota endpoint. Không có bằng chứng host rewrite giải quyết mọi 429 chat.[10]

### Data / commands

- `date -I` → `2026-08-22`.
- `git status --short` → `M .gitignore` và `?? docs/gsd-audit/`; các thay đổi này có sẵn trước artifact, không được sửa.
- Context7 resolve thành công Hermes: `/nousresearch/hermes-agent`, source reputation High, versions gồm `v2026.4.8`, `v2026.4.16`, `v2026.6.5`.
- Context7 query Hermes trả source-backed mô tả `api_max_retries`, credential pool rotation và fallback activation.[14][15]
- Context7 resolve thành công 9Router upstream library `/decolua/9router`, source reputation Medium. Query trả các đoạn source/docs upstream; artifact ưu tiên citation repo fork đang chạy vì cần đúng checkout hiện tại.
- Không chạy live request tới Google/Antigravity. Không đọc secrets, token, cookie, `.env` hoặc credential store.

### Internet / primary sources

- Google Gemini docs nói rate limits đo theo RPM/TPM/RPD, áp dụng theo project, RPD reset lúc midnight Pacific, khác nhau theo model/tier; `429 RESOURCE_EXHAUSTED` cũng dùng cho spend-based limit.[12]
- Google troubleshooting khuyến nghị exponential backoff cho `429 RESOURCE_EXHAUSTED` và `503 UNAVAILABLE`; SDK chính thức có retry transient mặc định, nhưng đây là Gemini API guidance, không chứng minh Antigravity `v1internal` có cùng quota semantics.[13]
- Hermes docs phân biệt credential pool cùng provider với fallback provider khác provider; pool được thử trước, fallback chỉ chạy sau khi pool cạn.[14][15]
- Hermes docs liệt kê Google/Gemini là API-key provider và Vertex AI là GCP-billed provider; docs không mô tả Antigravity như Hermes-native provider. Trong topology này Hermes gọi endpoint OpenAI-compatible do 9Router expose, còn 9Router mới dùng Antigravity/Cloud Code.[16]

## Flow or data model

```text
Hermes
  → configured OpenAI-compatible base URL/model
  → 9Router handleChat()
  → getProviderCredentials("antigravity", excludeIds, "gemini-3.7-flash-high")
  → projectId + OAuth access token
  → AntigravityExecutor
  → Cloud Code v1internal generateContent/streamGenerateContent
  → HTTP 429 or success

HTTP 429 path:
  executor retry (up to 3 registry attempts; retry hint capped at 10s)
  → chatCore parse upstream status/message
  → markAccountUnavailable()
  → modelLock_<model> on current connection
  → next 9Router connection
  → all connections locked: unavailableResponse + Retry-After
```

### Phân biệt các lớp giới hạn

| Lớp | Dấu hiệu | Cơ chế | Cách xác nhận |
|---|---|---|---|
| Upstream Antigravity/Google quota | 429 từ Cloud Code; body có `RESOURCE_EXHAUSTED`, quota/reset text, hoặc header retry | Gắn OAuth/project/model; 9Router chỉ truyền lỗi và tạm khóa connection/model | Xem raw upstream body/header trong log request; gọi dashboard quota bằng connection phù hợp; so sánh project/credential |
| Upstream transient rate limit/capacity | 429/5xx ngắn hạn, không có reset dài | Executor retry backoff; sau thất bại account fallback | Thử cùng account sau cooldown; kiểm tra `Retry-After`; xem nhiều request đồng thời |
| 9Router model lock | Các request sau 429 bị skip đúng một connection/model; dashboard có cooldown | `modelLock_<model>` trong SQLite/connection record | `/api/models/availability`; dashboard Provider status; log `locked modelLock_...` |
| 9Router all-account exhaustion | Không còn connection khả dụng; response có `Retry-After`, message `reset after ...` | Chọn account khác trước; khi hết thì trả lỗi cuối cùng hoặc 503 | Kiểm tra mọi Antigravity connection và lock expiry |
| Hermes credential pool | Hermes xoay credentials cùng provider; không phải 9Router connection | Retry/rotate/fallback theo Hermes config; trạng thái nằm ở Hermes | `hermes auth list`; log provider/credential selection; kiểm tra `credential_pool` metadata, không in secret |
| Request/model mismatch | 400/404/403 hoặc lỗi validation, không phải bằng chứng quota | Mapping/format/request body bị upstream từ chối | Raw status/body; so sánh upstream model ID và transformed body |

## Nguyên nhân có khả năng nhất

1. **Upstream quota/rate limit của Antigravity OAuth project/model — khả năng cao nhất.** Lý do: status 429 là upstream response class; Antigravity model có quota API riêng; model `High` là tiered model ID và quota tracker đọc per-model `quotaInfo`. Google cũng xác nhận 429 có thể do RPM/TPM/RPD/spend limit. Chưa thể nói quota ngày, RPM, TPM hay account subscription nào nếu thiếu raw error.[4][9][12]
2. **Tất cả 9Router Antigravity connections cùng chạm quota — khả năng trung bình nếu có nhiều account nhưng cùng project/proxy/IP.** 9Router xoay connection, nhưng source không chứng minh các OAuth connection có quota độc lập; Google docs nói Gemini API limits áp dụng theo project, không theo API key. Vì vậy thêm connection chỉ giúp nếu upstream thực sự tách quota; không nên giả định credential pool tạo quota mới.[8][12]
3. **Transient overload/rate limit — khả năng trung bình.** Nếu 429 chỉ xảy ra trong burst rồi tự hết, không có reset dài, retry exponential là đúng hướng. Nếu lặp lại ổn định cho cùng model/account và body có reset dài, đây giống quota exhaustion hơn.
4. **9Router nội bộ tạo 429 — khả năng thấp cho chat path.** Source trả 429 tới client khi status cuối cùng từ upstream là 429; 9Router tự đánh dấu lock và khi tất cả locked có thể trả 429 cuối cùng, nhưng nguyên nhân ban đầu vẫn upstream. Login route có 429 riêng cho failed attempts, không liên quan chat.
5. **Sai model ID/request shape — khả năng thấp hơn nếu status đúng 429.** Registry và tests chứng minh model ID được hỗ trợ trong checkout; vẫn cần raw upstream message vì provider có thể dùng 429 cho policy/unsupported capacity. 400/404 sẽ là tín hiệu mạnh hơn cho mapping sai.

## Cách kiểm tra an toàn

1. **Thu thập response không chứa credential:** thời điểm, HTTP status, response JSON message/code, response headers `Retry-After`, `X-RateLimit-*`, URL host/path đã mask query, model client và model upstream. Không gửi `Authorization`, refresh token, cookie, raw request body hay project secret vào issue/chat.
2. **Đọc log 9Router:** tìm cùng request tag các dòng `FETCH ... ← 429`, `ERROR 429`, `locked modelLock_gemini-3.7-flash-high`, `FALLBACK ... NEXT ACCOUNT`, và `all ... accounts locked`. Các dòng này phân biệt upstream response với local exhaustion.[5][6][8]
3. **Kiểm tra availability:** dùng dashboard/API model availability để xem provider `antigravity`, model `gemini-3.7-flash-high`, `until`, connection ID/name và `lastError`; không public endpoint nếu chưa bật auth.[10]
4. **Kiểm tra quota dashboard:** dùng connection tương ứng để refresh Antigravity usage. So sánh `remainingPercentage` và `resetAt` của model high với medium/low. `remainingFraction` là dữ liệu upstream quota parser; normalized `total=1000` chỉ là đơn vị UI, không phải 1,000 requests/tokens.[9][11]
5. **A/B test giảm rủi ro:** cùng connection, prompt nhỏ, concurrency=1, không tools, lần lượt `gemini-3.7-flash-low`/`medium`/`high`. Nếu low chạy nhưng high 429, nghi quota/model-tier high. Nếu mọi model 429, nghi account/project-wide quota hoặc upstream outage. Đây là kiểm tra chẩn đoán, không bypass quota.
6. **Kiểm tra Hermes:** xác nhận Hermes đang trỏ vào 9Router endpoint, model exact `antigravity/gemini-3.7-flash-high`, retry/fallback config, và không có nhiều worker/subagent cùng dùng credential. `hermes auth list` chỉ xem metadata; không paste key/token.[14][15]
7. **Không dùng MITM host rewrite như phép thử đầu tiên:** source có rewrite PROD → daily cho một path MITM vì PROD bị rate-limited, nhưng đây là workaround endpoint-specific, có rủi ro tương thích/chính sách và không áp dụng chắc chắn cho chat API.[10]

## Cách khắc phục an toàn

- **Nếu body có reset time dài hoặc quota dashboard gần 0:** chờ tới `resetAt`, giảm request/token/tool concurrency, chuyển tạm sang `gemini-3.7-flash-medium`/`low` hoặc provider khác. Không spam retry; Google khuyến nghị exponential backoff.[12][13]
- **Nếu chỉ một connection/model bị lock:** để cooldown tự hết hoặc dùng nút/API `clearCooldown` sau khi xác nhận upstream đã hồi phục. Clear lock không tạo quota; không clear lặp để bắn lại 429.
- **Nếu có nhiều connection độc lập:** cấu hình fallback theo mục tiêu continuity, nhưng không giả định nhiều OAuth account vượt được project-level quota. Xác minh project/quota scope trước khi thêm credential.[8][12]
- **Nếu Hermes tự retry quá dày:** giảm `agent.api_max_retries`, tránh đồng thời Hermes pool rotation với 9Router account rotation quá rộng, và đặt fallback model khác provider. Hermes docs mô tả fallback chỉ sau retry/pool exhaustion.[14][15]
- **Nếu response cho thấy token hết hạn/401/403:** re-auth/reconnect OAuth an toàn; không xử lý 429 như auth refresh. 9Router chỉ refresh token trong nhánh 401/403, không refresh cho 429.[7]
- **Nếu raw body cho thấy lỗi request/model:** sửa model/config hoặc request shape; không tăng retry. Registry upstream ID phải được giữ đúng `gemini-3.7-flash-tiered(high)`.[4][5]
- **Không sửa source, không đổi host production sang daily, không xóa DB lock hoặc thay credential hàng loạt trước khi giữ lại evidence.** Những thao tác đó có thể làm mất dấu nguyên nhân hoặc tạo thêm traffic.

## Risks and unknowns

- `antigravity.google`/Cloud Code `v1internal` là endpoint nội bộ/IDE-oriented; Google Gemini public docs không công bố đầy đủ semantics quota của Antigravity tiered models. Các số RPM/TPM/RPD trong Google docs không thể áp trực tiếp cho `gemini-3.7-flash-tiered(high)` nếu không có upstream response/account data.[4][12]
- 9Router registry hiện đánh dấu Antigravity deprecated và `RISK_NOTICE`; artifact không đánh giá pháp lý/chính sách sử dụng, chỉ ghi nhận source.[4]
- `getAntigravityUsage()` đọc quota discovery nhưng dashboard normalized `total=1000`; không được diễn giải thành quota thực tế.[9]
- Context7 có Hermes `/nousresearch/hermes-agent` và 9Router `/decolua/9router`; Context7 hữu ích để đối chiếu docs/source indexed nhưng bản fork hiện tại mới là nguồn chính cho behavior deployed. Không có Context7 entry riêng cho fork `NguyenThanhHungDev140503/9router`.
- Chưa có live 429 payload, header, log, project/quota snapshot. Vì vậy báo cáo kết luận xác suất, không khẳng định nguyên nhân đơn nhất.

## Implications for implementation

- Giữ nguyên raw upstream error metadata (status, sanitized body, retry/reset headers) trong diagnostic path; hiện `parseUpstreamError()` giữ body message nhưng Antigravity không override `parseError()` để biến body reset thành `resetsAtMs` cho DB lock.[5][6]
- Tách rõ `executor retry delay`, `9Router model lock`, `all-account Retry-After`, và Hermes pool/fallback trong logs/metrics để tránh gọi mọi 429 là “quota 9Router”.
- Cân nhắc test contract cho Antigravity: 429 có `Retry-After`, body `reset after`, 429 >10s veto, all connections locked, success clears model lock. Existing quota test chỉ phủ parsing `remainingFraction`.[5][8][11]
- Không tự động bypass quota bằng host rewrite hoặc credential churn. Chỉ thêm fallback/cooldown policy sau khi có response evidence và policy approval.

## Sources

[2] https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/config/errorConfig.js
[4] https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/providers/registry/antigravity.js
[5] https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/executors/antigravity.js
[6] https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/executors/base.js
[7] https://github.com/NguyenThanhHungDev140503/9router/blob/master/src/sse/handlers/chat.js
[8] https://github.com/NguyenThanhHungDev140503/9router/blob/master/src/sse/services/auth.js
[9] https://github.com/NguyenThanhHungDev140503/9router/blob/master/open-sse/services/usage/google.js
[10] https://github.com/NguyenThanhHungDev140503/9router/blob/master/src/mitm/server.js
[11] https://github.com/NguyenThanhHungDev140503/9router/blob/master/tests/unit/antigravity-quota-gemini-3.7.test.js
[12] https://ai.google.dev/gemini-api/docs/rate-limits
[13] https://ai.google.dev/gemini-api/docs/troubleshooting
[14] https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools
[15] https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers
[16] https://hermes-agent.nousresearch.com/docs/integrations/providers
