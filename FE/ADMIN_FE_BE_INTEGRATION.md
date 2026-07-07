# Admin FE-BE integration

Ngày đối chiếu: 2026-07-06

## Đã ghép

FE Admin hiện gọi API thật qua `VITE_API_BASE_URL`; không còn sử dụng `adminMockData`.

| Màn hình FE | API BE đã ghép |
| --- | --- |
| Đăng nhập | `POST /api/v1/admin/auth/login` |
| Dashboard | `GET /api/v1/admin/dashboard/stats`, `/revenue`, `/user-growth`, `/recent-users` |
| Users | `GET /api/v1/admin/users`, `GET /users/{id}`, `POST /users/{id}/ban`, `POST /users/{id}/unban`, `POST /staff` |
| Plans | `GET /api/v1/admin/plans`, `PATCH /plans/{id}` |
| Billing | `GET /billing/subscriptions`, `GET /billing/invoices`, `POST /billing/subscriptions/{user_id}/force-downgrade`, `POST /billing/invoices/{id}/refund` |
| Projects | `GET /api/v1/admin/projects`, `GET /projects/{id}`, `DELETE /projects/{id}` |
| Bake Jobs | `GET /api/v1/admin/bake-jobs`, `POST /bake-jobs/{id}/requeue`, `POST /bake-jobs/{id}/cancel` |
| Exports | `GET /api/v1/admin/exports` |
| System Health | `GET /api/v1/admin/system/health` |
| Audit Logs | `GET /api/v1/admin/audit-logs` |

Client đã xử lý bearer token, refresh access token một lần theo contract hiện tại, lỗi chuẩn `{ code, message }`, lỗi validation FastAPI và tự đưa người dùng về màn hình đăng nhập khi session hết hạn.

## BE có, FE chưa có UI

- Bake Job detail: `GET /api/v1/admin/bake-jobs/{job_id}` đã có ở BE và client nhưng chưa có drawer/modal hiển thị `design_config_snapshot` trên FE.
- Users: BE hỗ trợ `include_deleted`; FE chưa có bộ lọc hiển thị tài khoản đã xóa.
- Billing invoices: BE hỗ trợ lọc `user_id`; FE chưa có control tương ứng.
- Projects: BE hỗ trợ lọc `user_id` và `include_deleted`; FE chưa có control tương ứng.
- Bake Jobs: BE hỗ trợ lọc `project_id`; FE chưa có control tương ứng.
- Exports: BE hỗ trợ lọc `user_id` và `project_id`; FE chưa có control tương ứng.
- Audit Logs: BE hỗ trợ lọc chính xác theo `actor_id` và `target_id`; FE chưa có control riêng cho hai trường này.

## FE có nhu cầu, BE chưa hỗ trợ

- Admin logout phía server: FE có nút logout nhưng chỉ có thể xóa session local. `POST /api/v1/auth/logout` dùng dependency chỉ chấp nhận role `user`, nên token Admin/Staff không gọi được để revoke refresh token. Cần endpoint Admin logout hoặc mở rộng dependency an toàn.
- Audit Logs free-text search: FE có ô tìm kiếm nhưng BE không có query `q`. Hiện FE chỉ lọc dữ liệu của trang đã tải, không tìm trên toàn bộ log.
- Billing cần tên/email dễ đọc nhưng response subscription/invoice chỉ có `user_id`, không có `user_email`.
- Danh sách Projects chỉ có `user_id`; `owner_email` chỉ có ở project detail.
- Danh sách Bake Jobs chỉ có `project_id`, không có `project_name`.
- Danh sách Exports chỉ có `project_id` và `user_id`, không có `project_name`/`user_email`.
- Audit Logs chỉ có `actor_id`, không có `actor_email`.

Các màn hình liên quan hiện hiển thị ID thật thay cho dữ liệu tên/email từng được tạo bởi mock, để không trình bày dữ liệu không tồn tại trong response BE.

## Công việc BE cần thực hiện

### P0 - Admin logout và thu hồi refresh token

Tạo endpoint riêng để không dùng nhầm dependency `get_current_user`, vì dependency này chỉ chấp nhận role `user`:

```http
POST /api/v1/admin/auth/logout
Authorization: Bearer <admin_or_staff_access_token>
Content-Type: application/json

{
  "refresh_token": "..."
}
```

Yêu cầu:

- Dùng `get_current_admin` để chấp nhận cả `admin` và `staff`.
- Kiểm tra refresh token thuộc đúng user đang đăng nhập.
- Revoke refresh token trong DB.
- Trả `200 { "message": "Đăng xuất thành công" }`.
- Token đã revoke phải bị `POST /api/v1/auth/refresh` từ chối với `AUTH_REFRESH_INVALID`.
- Thêm test cho Admin, Staff, token sai chủ sở hữu và token đã revoke.

### P1 - Bổ sung dữ liệu hiển thị cho các API danh sách

Các response hiện chỉ có UUID khiến FE phải hiển thị ID. BE cần join/select thêm các trường sau:

| API/schema | Trường đang có | Trường BE cần bổ sung | Mục đích FE |
| --- | --- | --- | --- |
| `AdminSubscriptionResponse` | `user_id` | `user_email` | Hiển thị người sở hữu subscription |
| `AdminInvoiceResponse` | `user_id` | `user_email`, `polar_order_id` | Hiển thị người thanh toán và xác định khả năng refund |
| `AdminProjectListItem` | `user_id` | `owner_email` | Hiển thị chủ project trong bảng |
| `AdminBakeJobResponse` | `project_id` | `project_name` | Nhận diện job mà không phải đọc UUID |
| `AdminExportRecordResponse` | `project_id`, `user_id` | `project_name`, `user_email` | Nhận diện project và user export |
| `AuditLogResponse` | `actor_id` | `actor_email` | Nhận diện người thực hiện thao tác |

Các trường bổ sung phải xuất hiện trong OpenAPI và có test response model. Không bỏ các trường ID vì FE vẫn cần ID để lọc, điều hướng và gọi action.

Response mong muốn tối thiểu:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "user_email": "user@example.com"
}
```

Với dữ liệu liên quan đã bị xóa, email/tên nên là `null` thay vì làm hỏng toàn bộ request.

### P1 - Audit Log search phía server

Bổ sung query cho `GET /api/v1/admin/audit-logs`:

```http
?q=<text>&actor_id=<uuid>&action=<action>&target_type=<type>&target_id=<id>
```

`q` cần tìm không phân biệt hoa thường trên:

- `actor.email`;
- `target_id`;
- `action`;
- `target_type`;
- payload dạng text nếu PostgreSQL cho phép truy vấn JSONB phù hợp.

Yêu cầu thêm:

- Trim chuỗi; chuỗi rỗng được coi là không lọc.
- Giới hạn độ dài `q`, đề xuất tối đa 200 ký tự.
- Không nối chuỗi SQL trực tiếp; dùng SQLAlchemy parameter binding.
- Có index phù hợp cho các trường lọc chính xác. Search payload có thể để P2 nếu chi phí truy vấn cao.

### P1 - Chuẩn hóa pagination

Hiện FE suy luận `hasMore` bằng `items.length === limit` và gửi `before` bằng timestamp của item cuối. Cách này không xác định được trang cuối khi số record đúng bằng `limit`, đồng thời có nguy cơ bỏ/trùng record nếu nhiều item cùng timestamp.

BE nên trả envelope thống nhất cho mọi danh sách Admin:

```json
{
  "items": [],
  "next_cursor": "opaque-cursor-or-null"
}
```

Cursor nên chứa cả timestamp và UUID làm tie-breaker, được encode thành chuỗi opaque. Áp dụng cho:

- users;
- subscriptions;
- invoices;
- projects;
- bake jobs;
- exports;
- audit logs.

Nếu chưa thể đổi response ngay, BE phải bảo đảm sort ổn định theo `(created_at DESC, id DESC)` và định nghĩa rõ cách xử lý record trùng timestamp.

### P2 - Validation và enum contract

BE cần khai báo validation thống nhất trong query/schema thay vì nhận `str` tự do:

- `limit`: `1..100`;
- role: `user | staff | admin`;
- user status: `active | suspended`;
- subscription status: `active | cancelled | expired`;
- invoice status: `pending | paid | failed | refunded`;
- bake status: `queued | processing | completed | failed | cancelled`;
- bake priority: `low | normal | high`;
- export format: `glb | obj | zip`;
- project status: các giá trị thực tế được model/service hỗ trợ.

Giá trị không hợp lệ phải trả HTTP 422 theo một contract lỗi nhất quán. OpenAPI phải công bố được enum để FE có thể sinh type hoặc đối chiếu tự động.

## Công việc FE cần thực hiện

### P0 - Gọi Admin logout thật

Sau khi BE có `POST /api/v1/admin/auth/logout`:

- Đổi `logout()` trong `AdminAuthContext` thành async.
- Gửi access token và refresh token hiện tại tới endpoint.
- Luôn xóa local session trong `finally`, kể cả BE không phản hồi.
- Disable nút logout trong lúc request đang chạy để tránh gửi nhiều lần.
- Không dùng endpoint `/api/v1/auth/logout` hiện tại cho Admin/Staff.

### P1 - Hiển thị các trường BE bổ sung

Sau khi BE bổ sung schema:

- Billing: đổi User ID thành `user_email`, giữ ID ở tooltip hoặc dòng phụ.
- Projects: dùng `owner_email` trong bảng danh sách.
- Bake Jobs: dùng `project_name`; giữ `project_id` trong drawer/detail.
- Exports: dùng `project_name` và `user_email`.
- Audit Logs: dùng `actor_email`; giữ `actor_id` để lọc chính xác.
- Luôn fallback về UUID hoặc `—` nếu trường display là `null` để tương thích dữ liệu cũ.

TypeScript types trong `src/types/admin.ts` phải cập nhật đúng nullability của OpenAPI, không thêm field chỉ tồn tại trong mock.

### P1 - Hoàn thiện Bake Job detail

FE đã có client `adminBakeJobs.detail(jobId)` nhưng chưa dùng. Cần thêm nút xem và drawer/modal gồm:

- job ID, project ID/project name;
- status và priority;
- queued/started/completed time;
- worker ID;
- error message;
- `design_config_snapshot` hiển thị dạng JSON có format và vùng scroll.

Drawer cần có loading, empty/error state và không cho phép action trái với trạng thái hiện tại.

### P1 - Bổ sung các filter BE đã có

| Màn hình | Filter FE cần thêm | Query BE |
| --- | --- | --- |
| Users | Bao gồm tài khoản đã xóa | `include_deleted=true` |
| Billing/Invoices | User ID | `user_id` |
| Projects | User ID, bao gồm project đã xóa | `user_id`, `include_deleted` |
| Bake Jobs | Project ID | `project_id` |
| Exports | User ID, Project ID | `user_id`, `project_id` |
| Audit Logs | Actor ID, Target ID | `actor_id`, `target_id` |

Ô nhập text nên debounce khoảng 300-500 ms. UUID không hợp lệ cần được chặn ở FE hoặc hiển thị lỗi 422 rõ ràng.

### P1 - Chuyển Audit search sang server

Khi BE có query `q`:

- Gửi `q` qua `adminAuditLogs.list` thay vì chỉ filter `logs` đang có trong browser.
- Reset danh sách và cursor khi `q` thay đổi.
- Debounce request.
- Hủy hoặc bỏ qua response cũ khi người dùng nhập nhanh để tránh race condition.
- Xóa dòng mô tả “trên trang hiện tại” khỏi placeholder.

### P1 - Đồng bộ pagination envelope

Nếu BE chuyển sang `{ items, next_cursor }`, FE cần:

- Đổi type của các hàm list thành `CursorPage<T>`.
- Dùng `next_cursor !== null` để quyết định hiển thị “Tải thêm”.
- Không tự lấy timestamp của item cuối.
- Reset cursor khi filter/search đổi.
- Chống append trùng ID khi người dùng bấm tải thêm nhiều lần.

Type đề xuất:

```ts
interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}
```

### P2 - Trạng thái tải và lỗi

Các request đọc dữ liệu hiện cần được chuẩn hóa thêm:

- Có loading state cho từng bảng/drawer.
- Catch `AdminApiError` và hiển thị toast/error state thay vì để Promise rejection.
- Có nút thử lại khi network error.
- Disable action trong lúc mutation đang chạy.
- Sau mutation thành công, reload đúng resource hoặc cập nhật cache cục bộ.
- Với HTTP 401 không refresh được: về login; HTTP 403: giữ session và báo không đủ quyền.

### P2 - Dọn API client sau khi contract ổn định

- Bỏ tham số `_role` khỏi các hàm mutation; quyền phải do token và BE quyết định, không do FE truyền role vào client.
- Tách auth/session storage thành module dùng chung thay vì đọc trực tiếp localStorage trong API client.
- Có thể sinh TypeScript types từ OpenAPI để giảm lệch schema về sau.
- Thêm test cho query serialization, error parsing, refresh flow và session-expired event.

## Contract hai phía phải thống nhất

### Authentication

- Access token gửi qua `Authorization: Bearer`.
- Refresh token contract hiện tại chỉ cấp thêm access token một lần vì refresh token bị đánh dấu đã dùng. FE phải đưa người dùng về login sau lần refresh tiếp theo, trừ khi BE đổi sang refresh-token rotation.
- Nếu áp dụng rotation, response refresh phải trả cả `access_token` và `refresh_token`; FE phải thay cả hai atomically.
- Admin và Staff dùng cùng endpoint đọc; mutation Admin-only phải trả 403 `ADMIN_FORBIDDEN` cho Staff.

### Error response

Lỗi nghiệp vụ thống nhất:

```json
{
  "code": "ADMIN_FORBIDDEN",
  "message": "Chỉ quản trị viên mới có quyền thực hiện thao tác này"
}
```

Validation FastAPI vẫn có thể dùng `detail[]`; FE client hiện hỗ trợ cả hai dạng. Không trả HTML error page cho API.

### Date/time và tiền tệ

- Mọi datetime trả ISO 8601 có timezone.
- Cursor không phụ thuộc locale của browser.
- Tiền VND là integer, không gửi chuỗi đã format.
- FE chịu trách nhiệm format `vi-VN`; BE không format số thành text.

### Nullability

- Field không có dữ liệu phải trả `null`, không trả chuỗi rỗng tùy ý.
- OpenAPI, Pydantic schema và TypeScript type phải cùng nullable/non-nullable.
- FE phải có fallback cho dữ liệu legacy hoặc relation đã bị xóa.

## Thứ tự triển khai đề xuất

1. BE làm Admin logout và test revoke token.
2. BE bổ sung các display field vào response list, không phá các field ID hiện có.
3. FE cập nhật type và UI dùng display field với fallback ID.
4. FE làm Bake Job detail và các filter BE đã hỗ trợ.
5. BE thêm Audit `q`; FE chuyển search từ local sang server.
6. BE và FE cùng đổi pagination trong một nhánh/version contract để tránh một phía dùng array, phía kia dùng envelope.
7. Chuẩn hóa loading/error state và thêm contract tests.

## Tiêu chí nghiệm thu đồng bộ

- Admin đăng nhập, refresh, logout; refresh token sau logout không dùng lại được.
- Staff xem được tất cả màn hình đọc nhưng mọi mutation Admin-only trả 403 và UI disable action.
- Mọi bảng hiển thị tên/email khi relation tồn tại, fallback ID khi relation thiếu.
- Tất cả filter tạo đúng query và reset pagination.
- Search Audit tìm trên toàn bộ dữ liệu, không chỉ trang hiện tại.
- Load-more không trùng hoặc bỏ record khi nhiều record có cùng timestamp.
- OpenAPI schema khớp TypeScript type về tên field và nullability.
- FE build/lint pass; BE Admin tests và contract tests pass.

## Kiểm tra

- OpenAPI runtime tại `http://localhost:8000/openapi.json`: xác nhận đủ 24 method/path Admin mà client sử dụng.
- Health runtime: `GET /health` trả `status=ok`.
- Error contract runtime: login sai trả HTTP 401 với `AUTH_INVALID_CREDENTIALS`; endpoint protected không token trả HTTP 401.
- FE production build: `npm run build` pass trong Node 24 container tạm.
- FE lint giới hạn ở `src`: 0 error; còn 13 warning có sẵn trong dự án, trong đó có các cảnh báo dependency của React hooks ở một số màn hình Admin.
- BE Admin integration tests: `17 passed` (`pytest -q tests/test_admin.py`).
- Vite cảnh báo main JS chunk khoảng 1.66 MB; đây là vấn đề tối ưu bundle chung của FE, không chặn luồng Admin.
