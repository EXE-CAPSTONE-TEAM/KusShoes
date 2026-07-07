# Backend requirements for Admin FE synchronization

Ngày lập: 2026-07-06

Phạm vi tài liệu này chỉ gồm công việc Backend cần thực hiện để luồng Admin đồng bộ đầy đủ với Frontend.

## P0 - Admin/Staff logout và revoke refresh token

### Vấn đề hiện tại

FE có nút logout nhưng chỉ xóa session ở browser. Endpoint `POST /api/v1/auth/logout` hiện dùng `get_current_user`, dependency này chỉ chấp nhận role `user`, nên access token của `admin` hoặc `staff` bị từ chối. Refresh token Admin/Staff vì vậy không được revoke phía server.

### Endpoint cần bổ sung

```http
POST /api/v1/admin/auth/logout
Authorization: Bearer <admin_or_staff_access_token>
Content-Type: application/json

{
  "refresh_token": "<refresh-token>"
}
```

Response thành công:

```json
{
  "message": "Đăng xuất thành công"
}
```

### Cách triển khai

- File router: `app/routers/admin_auth.py`.
- Dùng `LogoutRequest` từ `app/schemas/auth.py`.
- Dùng dependency `get_current_admin`, không dùng `get_current_user`.
- Tái sử dụng `auth_service.logout(db, admin, body.refresh_token)`.
- Kiểm tra refresh token thuộc đúng tài khoản trong access token.
- Revoke token trong bảng `refresh_tokens`.
- Không cần phân biệt Admin và Staff ở thao tác logout.

### Error contract

- Access token thiếu/hỏng/hết hạn: HTTP 401 với auth error code hiện hành.
- Refresh token không tồn tại, đã dùng, đã revoke hoặc không thuộc actor: HTTP 401 `AUTH_REFRESH_INVALID`.
- Không trả token hoặc thông tin nhạy cảm trong response/log.

### Test bắt buộc

Thêm vào `tests/test_admin.py` hoặc file auth security tương ứng:

- Admin logout thành công.
- Staff logout thành công.
- Refresh token sau logout không thể gọi `/api/v1/auth/refresh`.
- Actor A không thể logout refresh token của actor B.
- Logout lại token đã revoke trả lỗi đúng contract.
- User thường không được dùng endpoint Admin logout.

## P1 - Bổ sung display fields vào response danh sách

### Mục tiêu

Frontend cần tên/email để hiển thị dữ liệu quản trị dễ đọc. Các UUID hiện tại vẫn phải được giữ lại để lọc, điều hướng và gọi mutation.

| Endpoint | Schema hiện tại | Field BE cần thêm | Nullability đề xuất |
| --- | --- | --- | --- |
| `GET /api/v1/admin/billing/subscriptions` | `AdminSubscriptionResponse` | `user_email` | `str \| None` |
| `GET /api/v1/admin/billing/invoices` | `AdminInvoiceResponse` | `user_email`, `polar_order_id` | `str \| None` |
| `GET /api/v1/admin/projects` | `AdminProjectListItem` | `owner_email` | `str \| None` |
| `GET /api/v1/admin/bake-jobs` | `AdminBakeJobResponse` | `project_name` | `str \| None` |
| `GET /api/v1/admin/bake-jobs/{job_id}` | `AdminBakeJobDetailResponse` | `project_name` | `str \| None` |
| `GET /api/v1/admin/exports` | `AdminExportRecordResponse` | `project_name`, `user_email` | `str \| None` |
| `GET /api/v1/admin/audit-logs` | `AuditLogResponse` | `actor_email` | `str \| None` |

### Schema cần sửa

- `app/schemas/subscription.py`
  - `AdminSubscriptionResponse.user_email`.
  - `AdminInvoiceResponse.user_email`.
  - `AdminInvoiceResponse.polar_order_id`.
- `app/schemas/admin.py`
  - `AdminProjectListItem.owner_email`.
  - `AdminBakeJobResponse.project_name`.
  - `AdminExportRecordResponse.project_name` và `user_email`.
  - `AuditLogResponse.actor_email`.

Không bỏ hoặc đổi tên các field hiện có.

### Repository/service cần sửa

- Billing list: join `subscriptions/invoices -> users`.
- Project list: join `projects -> users`.
- Bake Job list/detail: join `bake_jobs -> projects`.
- Export list: join `export_records -> projects` và `export_records -> users`.
- Audit list: left join `audit_logs -> users` theo `actor_id`.

Yêu cầu kỹ thuật:

- Tránh N+1 query; lấy display fields bằng join/select trong cùng query hoặc eager loading có kiểm soát.
- Dùng `LEFT JOIN` nếu record lịch sử phải tồn tại sau khi relation bị xóa.
- Nếu relation không còn tồn tại, trả `null`; không làm fail toàn bộ trang danh sách.
- Pagination và thứ tự hiện tại phải giữ nguyên.
- Response field mới phải xuất hiện trong OpenAPI.

### Response mẫu

Subscription:

```json
{
  "id": "subscription-uuid",
  "user_id": "user-uuid",
  "user_email": "user@example.com",
  "tier": "creator_monthly",
  "status": "active",
  "started_at": "2026-07-01T08:00:00Z",
  "expires_at": "2026-08-01T08:00:00Z",
  "cancel_at_period_end": false
}
```

Export:

```json
{
  "id": "export-uuid",
  "project_id": "project-uuid",
  "project_name": "Summer Sneaker",
  "user_id": "user-uuid",
  "user_email": "user@example.com",
  "format": "glb",
  "file_path": "exports/example.glb",
  "created_at": "2026-07-01T08:00:00Z"
}
```

### Test bắt buộc

- Mỗi endpoint trả đúng display field khi relation tồn tại.
- Không tăng số query theo số lượng item.
- Relation không còn tồn tại trả field `null` nếu tình huống này được schema/database cho phép.
- Các filter và pagination cũ vẫn hoạt động sau khi thêm join.
- OpenAPI schema chứa field mới và đúng nullable.

## P1 - Audit Log server-side search

### Query cần bổ sung

Mở rộng `GET /api/v1/admin/audit-logs`:

```http
?q=<text>
&actor_id=<uuid>
&action=<action>
&target_type=<type>
&target_id=<id>
&limit=20
&before=<iso-datetime>
```

`actor_id`, `action`, `target_type`, `target_id` đã có; cần bổ sung `q`.

### Quy tắc tìm kiếm `q`

- Trim trước khi query.
- Chuỗi rỗng tương đương không truyền `q`.
- Giới hạn tối đa 200 ký tự.
- Tìm không phân biệt hoa thường trên:
  - actor email;
  - action;
  - target type;
  - target ID.
- Search payload JSONB là P2 nếu chi phí cao; nếu làm, cần benchmark và giới hạn hợp lý.
- Kết hợp `q` với các filter chính xác bằng điều kiện `AND`.
- Không nối raw SQL từ input; dùng SQLAlchemy expression/parameter binding.

### File cần sửa

- `app/routers/admin_ops.py`: nhận và validate `q`.
- `app/services/admin_service.py`: truyền `q` xuống repository.
- `app/repositories/audit_log_repo.py`: thực hiện search và join actor.

### Index đề xuất

- Giữ B-tree index cho `actor_id`, `action`, `target_type`, `target_id`, `created_at` nếu chưa có.
- Nếu cần search email/text ở quy mô lớn, cân nhắc `pg_trgm` và GIN index trong migration riêng.
- Không tạo index payload JSONB khi chưa có query plan/benchmark chứng minh nhu cầu.

### Test bắt buộc

- Search theo actor email, action, target type và target ID.
- Search không phân biệt hoa thường.
- `q` kết hợp đúng với filter khác.
- `q` rỗng hoạt động như không filter.
- `q` quá 200 ký tự trả HTTP 422.
- Staff không truy cập được Audit Logs; Admin truy cập được.

## P1 - Validation query thống nhất

Các query Admin hiện dùng nhiều `str` và `int` tự do. Cần giới hạn ở router/schema để OpenAPI phản ánh đúng contract.

### Giới hạn chung

- `limit`: từ 1 đến 100.
- `before`: datetime ISO 8601 hợp lệ.
- UUID filter: UUID hợp lệ.
- `q`: trim, tối đa 200 ký tự.

### Enum cần công bố

- Role: `user`, `staff`, `admin`.
- User status: `active`, `suspended`.
- Subscription status: `active`, `cancelled`, `expired`.
- Invoice status: `pending`, `paid`, `failed`, `refunded`.
- Bake status: `queued`, `processing`, `completed`, `failed`, `cancelled`.
- Bake priority: `low`, `normal`, `high`.
- Export format: `glb`, `obj`, `zip`.
- Project status: thống nhất với các giá trị service/model thực tế.

### Yêu cầu

- Dùng `Query(ge=..., le=...)`, `Literal`, enum hoặc Pydantic query model phù hợp.
- Giá trị không hợp lệ trả HTTP 422.
- Không silently ignore filter sai.
- OpenAPI phải hiển thị allowed values để FE đối chiếu hoặc sinh types.

## P2 - Pagination ổn định

### Vấn đề hiện tại

Các API trả array thuần và dùng `before` là timestamp. Nếu nhiều record cùng timestamp, client có thể bỏ hoặc nhận trùng record. Client cũng phải suy luận `hasMore` bằng `items.length === limit`.

### Contract đề xuất

```json
{
  "items": [],
  "next_cursor": "opaque-cursor-or-null"
}
```

Áp dụng thống nhất cho:

- users;
- subscriptions;
- invoices;
- projects;
- bake jobs;
- exports;
- audit logs.

### Quy tắc cursor

- Sort ổn định theo `(created_at DESC, id DESC)` hoặc field thời gian tương ứng.
- Cursor chứa timestamp và UUID tie-breaker.
- Cursor được encode thành opaque string; FE không cần hiểu cấu trúc.
- Cursor hỏng trả HTTP 422 với error code riêng hoặc validation detail rõ ràng.
- `next_cursor = null` khi không còn trang tiếp theo.
- Không đổi array sang envelope cho đến khi FE sẵn sàng trong cùng version/nhánh contract vì đây là breaking change.

Nếu chưa triển khai envelope, tối thiểu phải sort theo timestamp và UUID để thứ tự xác định.

## P2 - Refresh-token rotation

### Trạng thái hiện tại

`POST /api/v1/auth/refresh` đánh dấu refresh token đã dùng nhưng chỉ trả access token. Vì vậy mỗi login chỉ refresh được một lần.

### Contract đề xuất

Sau khi refresh thành công:

```json
{
  "access_token": "new-access-token",
  "refresh_token": "new-refresh-token",
  "token_type": "bearer"
}
```

Yêu cầu:

- Revoke/mark-used refresh token cũ.
- Sinh refresh token mới trong cùng transaction logic phù hợp.
- Phát hiện reuse token cũ và từ chối.
- Định nghĩa TTL rõ ràng.
- Cập nhật `AccessTokenResponse` hoặc tạo response schema mới.
- Đây là thay đổi contract; phải phối hợp FE trước khi release.

## Error contract Backend phải giữ ổn định

Lỗi nghiệp vụ:

```json
{
  "code": "ADMIN_FORBIDDEN",
  "message": "Chỉ quản trị viên mới có quyền thực hiện thao tác này"
}
```

Yêu cầu:

- HTTP status phù hợp: 400/401/403/404/409/422/500.
- `code` ổn định để FE xử lý logic.
- `message` có thể hiển thị cho người dùng, không chứa stack trace hoặc dữ liệu nhạy cảm.
- Validation FastAPI có thể trả `detail[]`; không trả HTML error page.
- Staff gọi mutation Admin-only phải trả HTTP 403 `ADMIN_FORBIDDEN`.
- Access token hết hạn/không hợp lệ phải trả HTTP 401, không trả 500.

## Date, money và nullability

- Mọi datetime trả ISO 8601 có timezone.
- Tiền VND trả integer, không format thành chuỗi.
- Field không có dữ liệu trả `null`, không dùng chuỗi rỗng tùy trường hợp.
- Pydantic schema phải phản ánh đúng nullable của DB/service.
- Display field từ relation lịch sử nên nullable để không phá response nếu relation bị xóa.

## Thứ tự Backend nên triển khai

1. Admin logout và test revoke refresh token.
2. Bổ sung display fields bằng join, giữ nguyên ID và response behavior cũ.
3. Bổ sung Audit `q` và validation query.
4. Chuẩn hóa enum/OpenAPI.
5. Phối hợp FE để đổi pagination envelope.
6. Phối hợp FE để triển khai refresh-token rotation.

## Definition of Done cho Backend

- `POST /api/v1/admin/auth/logout` hoạt động với Admin và Staff.
- Refresh token sau logout không dùng lại được.
- Tất cả list response có display fields yêu cầu và vẫn giữ ID.
- Không phát sinh N+1 query.
- Audit search chạy trên toàn bộ dữ liệu, kết hợp được với filter hiện có.
- Query sai trả HTTP 422; Staff mutation trả HTTP 403.
- OpenAPI phản ánh đúng field, enum và nullability.
- Test Admin hiện có không regression.
- Test mới bao phủ logout, display fields, search và validation.
- Chạy và pass đầy đủ:

```bash
pytest -q tests/test_architecture.py
ruff check app tests
pytest -q tests/test_admin.py
pytest -q
```

## Các file Backend dự kiến bị ảnh hưởng

- `app/routers/admin_auth.py`
- `app/routers/admin_billing.py`
- `app/routers/admin_ops.py`
- `app/schemas/admin.py`
- `app/schemas/subscription.py`
- `app/services/admin_service.py`
- `app/services/billing_service.py`
- `app/services/auth_service.py` nếu làm rotation
- `app/repositories/audit_log_repo.py`
- `app/repositories/bake_job_repo.py`
- `app/repositories/export_record_repo.py`
- `app/repositories/invoice_repo.py`
- `app/repositories/project_repo.py`
- `app/repositories/subscription_repo.py`
- migration mới nếu bổ sung index
- `tests/test_admin.py`
- test auth/security tương ứng nếu tách riêng
