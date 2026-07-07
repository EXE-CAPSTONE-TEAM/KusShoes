# Frontend requirements for Admin BE synchronization

Ngày lập: 2026-07-06

Phạm vi tài liệu này chỉ gồm công việc Frontend cần thực hiện để luồng Admin đồng bộ đầy đủ với Backend.

## Trạng thái FE hiện tại

FE đã hoàn thành:

- Bỏ mock data và gọi 24 API method/path Admin thật.
- Gửi bearer access token cho API Admin.
- Lưu refresh token và thử refresh access token khi nhận HTTP 401.
- Parse lỗi nghiệp vụ `{ code, message }` và lỗi validation `detail[]` của FastAPI.
- Tự xóa session và trở về trang login khi refresh thất bại.
- Ghép các màn hình Dashboard, Users, Plans, Billing, Projects, Bake Jobs, Exports, System Health và Audit Logs.
- Hiển thị UUID thay cho những tên/email BE chưa trả về.
- Production build pass; TypeScript pass.

Các phần dưới đây là công việc FE còn cần thực hiện.

## P0 - Tích hợp Admin/Staff logout phía server

### Phụ thuộc BE

Chỉ triển khai sau khi BE có:

```http
POST /api/v1/admin/auth/logout
```

Endpoint phải chấp nhận access token role `admin` hoặc `staff`, nhận `refresh_token` trong body và revoke token phía server.

### Công việc FE

- Thêm `adminAuth.logout(refreshToken)` trong `src/api/adminClient.ts`.
- Đổi `logout` trong `AdminAuthContextType` thành `() => Promise<void>`.
- Lấy refresh token từ Admin session hiện tại.
- Gửi request với access token hiện tại và body:

```json
{
  "refresh_token": "..."
}
```

- Luôn xóa local session trong `finally`, kể cả API timeout hoặc trả lỗi.
- Dispatch/cập nhật context để UI trở về trang login ngay sau khi local session bị xóa.
- Disable nút logout trong lúc request đang chạy.
- Không gọi endpoint `/api/v1/auth/logout` hiện tại vì endpoint đó chỉ chấp nhận role `user`.
- Không log access token hoặc refresh token ra console.

### Tiêu chí hoàn thành

- Admin logout thành công và trở về login.
- Staff logout thành công và trở về login.
- Logout vẫn xóa local session khi BE offline.
- Double-click không gửi nhiều request logout.
- Refresh token cũ không dùng lại được sau logout; phần này xác nhận bằng integration test với BE.

## P1 - Cập nhật TypeScript types theo display fields mới

### Phụ thuộc BE

BE cần bổ sung các field sau trong OpenAPI/response:

| Type FE | Field cần thêm | Nullability FE phải dùng |
| --- | --- | --- |
| `AdminSubscription` | `user_email` | `string \| null` |
| `AdminInvoice` | `user_email`, `polar_order_id` | `string \| null` |
| `AdminProjectSummary` | `owner_email` | `string \| null` |
| `AdminBakeJob` | `project_name` | `string \| null` |
| `AdminExport` | `project_name`, `user_email` | `string \| null` |
| `AdminAuditLog` | `actor_email` | `string \| null` |

### Công việc FE

- Cập nhật `src/types/admin.ts` đúng theo OpenAPI.
- Không xóa các field ID hiện tại.
- Không khai báo field non-null nếu BE có thể trả `null`.
- Không tự tạo dữ liệu tên/email giả trong API client.
- Nếu dự án áp dụng OpenAPI code generation, generated type phải là source of truth; không sửa generated file thủ công.

### Quy tắc fallback UI

- Email có giá trị: hiển thị email.
- Email `null`: hiển thị UUID hoặc `—` tùy ngữ cảnh.
- Tên project có giá trị: hiển thị tên, UUID ở tooltip/dòng phụ.
- Tên project `null`: hiển thị project ID.
- Không để text `undefined` hoặc `null` xuất hiện trên màn hình.

## P1 - Hiển thị display fields thay cho UUID

Sau khi type được cập nhật:

### Billing

File: `src/pages/Admin/Billing/AdminBilling.tsx`

- Subscription table hiển thị `user_email`.
- Invoice table hiển thị `user_email`.
- Giữ `user_id` ở tooltip hoặc dòng phụ để hỗ trợ debug/filter.
- Refund button chỉ enable khi:
  - role là Admin;
  - invoice status là `paid`;
  - payment method là `polar`;
  - `polar_order_id` có giá trị.

### Projects

File: `src/pages/Admin/Projects/AdminProjects.tsx`

- Danh sách hiển thị `owner_email`.
- Drawer detail tiếp tục hiển thị owner email và có thể hiển thị user ID ở dòng phụ.
- Fallback sang `user_id` nếu email không tồn tại.

### Bake Jobs

File: `src/pages/Admin/BakeJobs/AdminBakeJobs.tsx`

- Danh sách hiển thị `project_name`.
- Giữ project ID trong detail/tooltip.
- Toast requeue/cancel dùng project name, fallback project ID.

### Exports

File: `src/pages/Admin/Exports/AdminExports.tsx`

- Hiển thị `project_name` và `user_email`.
- Fallback lần lượt sang `project_id` và `user_id`.

### Audit Logs

File: `src/pages/Admin/AuditLogs/AdminAuditLogs.tsx`

- Hiển thị `actor_email` cùng role badge.
- Actor ID đặt trong tooltip/dòng phụ hoặc copy action.
- Fallback sang actor ID nếu email `null`.

## P1 - Hoàn thiện Bake Job detail

FE đã có client:

```ts
adminBakeJobs.detail(jobId)
```

Nhưng màn hình chưa gọi API này.

### UI cần bổ sung

- Thêm nút `Eye`/“Xem chi tiết” trên mỗi dòng Bake Job.
- Khi mở, gọi `GET /api/v1/admin/bake-jobs/{job_id}`.
- Hiển thị drawer hoặc modal theo pattern Users/Projects hiện có.

### Nội dung drawer

- Job ID.
- Project name và project ID.
- Status.
- Priority.
- Worker ID.
- Queued time.
- Started time.
- Completed time.
- Error message.
- `design_config_snapshot` dạng JSON được format.

### Yêu cầu UX

- Có loading state trong drawer.
- Có error state và nút thử lại.
- JSON nằm trong vùng scroll, không làm drawer vượt chiều rộng màn hình.
- Có nút copy JSON hoặc copy job ID nếu phù hợp.
- Requeue chỉ xuất hiện khi status `failed` và role Admin.
- Cancel chỉ xuất hiện khi status `queued` và role Admin.
- Staff nhìn thấy detail nhưng không thực hiện mutation.
- Sau mutation thành công, reload list và detail để tránh trạng thái cũ.

## P1 - Bổ sung filter BE đã hỗ trợ

### Users

File: `src/pages/Admin/Users/AdminUsers.tsx`

- Thêm checkbox/switch “Bao gồm tài khoản đã xóa”.
- Gửi `include_deleted=true` khi bật.
- Reset danh sách và cursor khi giá trị thay đổi.
- Hiển thị badge deleted nếu `deleted_at` có giá trị.

### Billing invoices

File: `src/pages/Admin/Billing/AdminBilling.tsx`

- Thêm input User ID.
- Gửi query `user_id`.
- Validate UUID trước khi request hoặc hiển thị lỗi 422 rõ ràng.

### Projects

File: `src/pages/Admin/Projects/AdminProjects.tsx`

- Thêm input User ID.
- Thêm switch “Bao gồm project đã xóa”.
- Gửi `user_id` và `include_deleted`.

### Bake Jobs

File: `src/pages/Admin/BakeJobs/AdminBakeJobs.tsx`

- Thêm input Project ID.
- Gửi `project_id`.

### Exports

File: `src/pages/Admin/Exports/AdminExports.tsx`

- Thêm input User ID.
- Thêm input Project ID.
- Gửi `user_id`, `project_id` cùng filter format.

### Audit Logs

File: `src/pages/Admin/AuditLogs/AdminAuditLogs.tsx`

- Thêm input Actor ID.
- Thêm input Target ID.
- Gửi `actor_id`, `target_id` cùng action và target type.

### Quy tắc chung cho filter

- Text search debounce 300-500 ms.
- UUID filter có thể submit bằng Enter để tránh request khi UUID chưa nhập xong.
- Reset pagination khi bất kỳ filter nào thay đổi.
- Có nút xóa toàn bộ filter.
- Filter state phải thể hiện rõ trên UI.
- Không gửi query có chuỗi rỗng hoặc giá trị `undefined`.

## P1 - Chuyển Audit Log search sang server

### Phụ thuộc BE

BE cần hỗ trợ:

```http
GET /api/v1/admin/audit-logs?q=<text>
```

### Công việc FE

- Thêm lại `q?: string` vào `AuditLogListQuery` trong `adminClient.ts`.
- Gửi `q` tới BE thay vì chỉ filter mảng `logs` trong browser.
- Xóa `visibleLogs` local filter khi server search đã hoạt động.
- Debounce `q` khoảng 300-500 ms.
- Reset list và cursor khi `q` thay đổi.
- Bỏ qua hoặc abort response cũ khi người dùng nhập nhanh.
- Placeholder đổi thành “Tìm theo actor, action, target hoặc payload...”.
- Có loading/empty state riêng cho kết quả search.

### Tiêu chí hoàn thành

- Search tìm được record ngoài trang đầu tiên.
- Search kết hợp đúng với action/target type/actor ID/target ID.
- Xóa search trả lại danh sách mặc định.
- Response cũ không ghi đè response mới.

## P1 - Đồng bộ pagination cursor

### Phụ thuộc BE

Nếu BE đổi list response thành:

```json
{
  "items": [],
  "next_cursor": "opaque-cursor-or-null"
}
```

FE phải đổi cùng version/nhánh contract. Không merge riêng thay đổi FE trước BE vì response array hiện tại sẽ không còn tương thích.

### Type dùng chung

```ts
export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}
```

### API client

- Các hàm list trả `Promise<CursorPage<T>>`.
- Query dùng `cursor`, không tự tạo `before` từ timestamp item cuối.
- `queryString` bỏ qua cursor `null`/`undefined`.

### UI

- Set dữ liệu từ `page.items`.
- Hiển thị “Tải thêm” khi `page.next_cursor !== null`.
- Lưu cursor cuối theo bộ filter hiện tại.
- Reset cursor khi filter/search/tab thay đổi.
- Disable nút trong lúc tải trang tiếp theo.
- Deduplicate theo `id` trước khi append để chống double-click/race.
- Không suy luận `hasMore` bằng `items.length === limit`.

### Màn hình bị ảnh hưởng

- Users.
- Billing subscriptions.
- Billing invoices.
- Projects.
- Bake Jobs.
- Exports.
- Audit Logs.

## P1 - Chuẩn hóa loading, error và mutation state

Các request đọc hiện chưa có error handling đồng đều.

### State tối thiểu

Mỗi list/detail nên có:

```ts
type RequestState = {
  loading: boolean;
  error: string | null;
};
```

### Yêu cầu

- Hiển thị skeleton/spinner khi tải lần đầu.
- Không hiển thị empty state trước khi request kết thúc.
- Catch `AdminApiError` cho mọi request đọc và mutation.
- Network error có nút “Thử lại”.
- Mutation button disable trong lúc đang chạy.
- Không gửi đồng thời cùng một mutation nhiều lần.
- Mutation thành công hiển thị toast và cập nhật dữ liệu.
- Mutation lỗi giữ dialog/drawer nếu người dùng cần sửa/thử lại.
- HTTP 401 không refresh được: xóa session và về login.
- HTTP 403: giữ session, báo không đủ quyền.
- HTTP 422: hiển thị validation message.
- HTTP 409: hiển thị lỗi trạng thái nghiệp vụ từ BE.

### Request race

Với search/filter thay đổi nhanh:

- Dùng `AbortController`, request ID hoặc cờ mounted/current request.
- Response cũ không được ghi đè dữ liệu của filter mới.
- Cleanup request khi component unmount.

## P2 - Dọn Admin API client

File: `src/api/adminClient.ts`

### Bỏ role argument khỏi mutation

Các hàm hiện còn `_role` để tương thích code mock cũ:

```ts
adminUsers.ban(role, userId, reason)
adminPlans.update(role, planId, patch)
```

Cần đổi thành:

```ts
adminUsers.ban(userId, reason)
adminPlans.update(planId, patch)
```

Lý do: authorization do bearer token và BE quyết định; FE truyền role không tạo ra bảo mật.

Sau khi đổi, cập nhật mọi call site ở Admin pages.

### Tách session storage

- Tạo module quản lý Admin token/session dùng chung.
- `AdminAuthContext` và `adminClient` không tự parse cùng một localStorage key theo hai cách khác nhau.
- Có các hàm typed: `getAdminSession`, `saveAdminSession`, `updateAccessToken`, `clearAdminSession`.
- Parse lỗi hoặc dữ liệu storage sai phải clear an toàn.

### Refresh flow

- Chỉ cho một refresh request chạy tại một thời điểm.
- Các request 401 đồng thời chờ chung `refreshPromise`.
- Mỗi request chỉ retry một lần.
- Không refresh endpoint login/refresh/logout.
- Nếu BE triển khai refresh-token rotation, lưu access token và refresh token mới atomically.
- Không tạo vòng lặp 401 -> refresh -> retry vô hạn.

### Query serialization

- Encode đầy đủ UUID, datetime, search text.
- Bỏ `undefined`, `null` và chuỗi rỗng khi contract yêu cầu.
- Boolean `false` vẫn phải được gửi nếu có ý nghĩa.
- Có unit test cho query kết hợp nhiều filter.

## P2 - Đồng bộ types từ OpenAPI

Đề xuất thêm bước CI:

- Lấy OpenAPI từ BE build/test artifact.
- Sinh hoặc kiểm tra TypeScript API types.
- Fail CI nếu schema Admin thay đổi nhưng FE type chưa cập nhật.

Nếu chưa codegen:

- Duy trì contract test so sánh các field quan trọng.
- Ghi rõ nullable và enum trong `src/types/admin.ts`.
- Không dùng `any` để bỏ qua lệch contract.

## P2 - Auth storage và bảo mật browser

Hiện Admin session nằm trong localStorage. Cần thống nhất với BE về chiến lược dài hạn:

- Ưu tiên refresh token trong secure, httpOnly, sameSite cookie nếu kiến trúc cho phép.
- Access token chỉ lưu memory hoặc storage ngắn hạn.
- Nếu tiếp tục dùng localStorage, phải chấp nhận rủi ro XSS và tăng cường CSP/sanitize dependency.
- Không render raw HTML từ payload Audit Log.
- JSON payload chỉ hiển thị text đã escape bởi React.
- Không đưa token vào URL, query string, toast hoặc log.

Việc chuyển sang cookie là thay đổi contract lớn và phải phối hợp BE; không tự đổi một phía.

## Tests FE cần bổ sung

### API client unit tests

- Login request đúng endpoint/body.
- Authorization header lấy đúng access token.
- Query string bỏ field `undefined`.
- Parse `{ code, message }`.
- Parse FastAPI `detail[]`.
- Network error thành `AdminApiError` với `NETWORK_ERROR`.
- Một lần refresh và retry khi 401.
- Refresh thất bại phát session-expired event.
- Nhiều request 401 dùng chung refresh promise.
- Không retry vô hạn.
- Logout luôn clear local session.

### Component tests

- Staff thấy dữ liệu nhưng mutation button bị disable/ẩn đúng yêu cầu.
- Admin thực hiện được mutation.
- Loading, empty, error và retry states.
- Filter tạo đúng query.
- Filter thay đổi reset pagination.
- Load more append không trùng ID.
- Display field `null` fallback UUID/`—`.
- Bake Job drawer hiển thị JSON snapshot.
- Audit search không bị race response.

### End-to-end tests

- Admin login -> Dashboard -> Users -> logout.
- Staff login -> xem các trang -> không mutation được.
- Ban/unban user.
- Update plan.
- Force downgrade/refund với dữ liệu test hợp lệ.
- Delete project.
- Requeue/cancel Bake Job theo đúng trạng thái.
- Xem Exports, System Health và Audit Logs.
- Access token hết hạn -> refresh -> request thành công.
- Session không refresh được -> trở về login.

Không chạy mutation E2E trên production data; dùng test environment và fixture riêng.

## Thứ tự FE nên triển khai

1. Chuẩn hóa loading/error/mutation state cho các màn hình hiện có.
2. Làm Bake Job detail và các filter BE đã hỗ trợ ngay.
3. Khi BE bổ sung display fields: cập nhật types và chuyển UI từ UUID sang tên/email.
4. Khi BE có Admin logout: nối logout server-side.
5. Khi BE có Audit `q`: chuyển search local sang server.
6. Khi BE chốt pagination envelope: đổi client và toàn bộ list trong cùng nhánh contract.
7. Dọn role argument/session module và bổ sung automated tests.

## Definition of Done cho Frontend

- Không còn mock data hoặc demo credential trong luồng Admin.
- Mọi Admin screen gọi đúng API thật.
- Admin/Staff logout gọi BE và luôn clear local session.
- TypeScript types khớp OpenAPI về field, enum và nullability.
- Bảng hiển thị tên/email, fallback UUID khi relation thiếu.
- Bake Job có màn hình detail đầy đủ.
- Tất cả filter BE hỗ trợ đều có control FE tương ứng.
- Audit search chạy phía server và tìm được ngoài trang đầu.
- Pagination không bỏ/trùng record.
- Mọi request có loading/error/retry phù hợp.
- Mutation chống double-submit và phản ánh dữ liệu mới sau thành công.
- Staff không thể thao tác Admin-only từ UI; BE vẫn là lớp authorization cuối cùng.
- Không dùng `any` để che lỗi contract.
- Production build và lint không có error.
- Unit/component/E2E tests quan trọng pass.

## Các file FE dự kiến bị ảnh hưởng

- `src/api/adminClient.ts`
- `src/context/AdminAuthContext.tsx`
- module session storage mới nếu tách
- `src/types/admin.ts`
- `src/pages/Admin/AdminLayout/AdminSidebar.tsx`
- `src/pages/Admin/AuditLogs/AdminAuditLogs.tsx`
- `src/pages/Admin/BakeJobs/AdminBakeJobs.tsx`
- `src/pages/Admin/Billing/AdminBilling.tsx`
- `src/pages/Admin/Exports/AdminExports.tsx`
- `src/pages/Admin/Projects/AdminProjects.tsx`
- `src/pages/Admin/Users/AdminUsers.tsx`
- `src/pages/Admin/Plans/AdminPlans.tsx`
- `src/pages/Admin/Dashboard/AdminDashboard.tsx`
- `src/pages/Admin/SystemHealth/AdminSystemHealth.tsx`
- test files mới cho Admin client/components/E2E
