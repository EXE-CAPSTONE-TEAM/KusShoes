# KusShoes Platform - Production Readiness Roadmap

**Document Version:** 1.0  
**Created:** July 8, 2026  
**Status:** Pre-Production Review  

---

## Executive Summary

| Component | Current Score | Target Score | Priority |
|-----------|--------------|--------------|----------|
| **Backend (BE)** | 7.5/10 | 9/10 | High |
| **Frontend (FE)** | 6.0/10 | 9/10 | High |
| **Overall** | **6.5/10** | **9/10** | - |

**Verdict:** Platform có thể triển khai production sau khi hoàn thành các critical items bên dưới.

---

## Phase 1: Critical Security Fixes (Week 1)

### 1.1 Backend Security

#### [CRITICAL] Rate Limiting on Authentication Endpoints
**File:** `BE/app/api/auth.py`
**Priority:** P0
**Effort:** 1 day

**Mô tả:** Demo auth endpoint cho phép tạo user vô hạn, cần thêm rate limiting.

**Implementation:**
```python
# Thêm vào dependencies.py hoặc tạo middleware mới
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/demo-login")
@limiter.limit("5/minute")
async def demo_login(request: Request):
    # existing code
```

**Acceptance Criteria:**
- [ ] Demo login bị giới hạn 5 requests/phút
- [ ] Login thường bị giới hạn 10 requests/phút  
- [ ] Rate limit trả về 429 Too Many Requests

#### [CRITICAL] JWT Token Security Enhancement
**Files:** `BE/app/core/security.py`, `FE/src/api/client.ts`
**Priority:** P0
**Effort:** 2 days

**Mô tả:** JWT access token hiện tại lưu trong localStorage, cần chuyển sang httpOnly cookies.

**Backend Changes:**
```python
# BE/app/core/security.py - Thêm refresh token flow
def create_tokens(user_id: str) -> dict:
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,  # Store in httpOnly cookie
    }

# Thêm endpoint refresh token
@router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(401, "Refresh token required")
    # Validate and issue new access token
```

**Frontend Changes:**
```typescript
// FE/src/api/client.ts - Sử dụng credentials: 'include' thay vì localStorage
async login(email: string, password: string) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        credentials: 'include',  // Nhận httpOnly cookie
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    // Không lưu token vào localStorage nữa
}
```

**Acceptance Criteria:**
- [ ] Access token vẫn có thể đọc từ memory (để gửi API)
- [ ] Refresh token chỉ lưu trong httpOnly cookie
- [ ] Token không còn trong localStorage
- [ ] Refresh flow hoạt động khi access token hết hạn

#### [HIGH] Input Sanitization for File Uploads
**File:** `BE/app/api/designs.py`, `BE/app/api/projects.py`
**Priority:** P1
**Effort:** 1 day

**Mô tả:** Sanitize tên file upload để prevent path traversal.

**Implementation:**
```python
import re
from pathlib import Path

def sanitize_filename(filename: str) -> str:
    # Remove path components
    filename = Path(filename).name
    # Remove special characters
    filename = re.sub(r'[^\w\s.-]', '', filename)
    # Limit length
    return filename[:255]

@router.post("/designs/assets")
async def upload_asset(upload: UploadFile):
    safe_filename = sanitize_filename(upload.filename)
    # Proceed with safe_filename
```

---

### 1.2 Frontend Security

#### [CRITICAL] Remove Token from localStorage
**File:** `FE/src/api/client.ts`
**Priority:** P0
**Effort:** 1 day

**Mô tả:** Di chuyển token management sang backend với httpOnly cookies (xem 1.1).

**Changes Required:**
1. Xóa `localStorage.setItem('token', ...)` 
2. Xóa `localStorage.getItem('token')`
3. Thêm `credentials: 'include'` vào tất cả fetch requests
4. Xử lý 401 responses để trigger refresh flow

**Acceptance Criteria:**
- [ ] Token không còn trong localStorage sau login
- [ ] Refresh token tự động khi access token hết hạn
- [ ] Logout xóa cookies server-side

---

## Phase 2: Error Handling & Stability (Week 1-2)

### 2.1 Backend Error Handling

#### [HIGH] Structured Logging with Request IDs
**File:** `BE/app/main.py`
**Priority:** P1
**Effort:** 1 day

**Mô tả:** Thêm request ID vào tất cả logs để trace requests.

**Implementation:**
```python
# BE/app/main.py
import uuid
from loguru import logger
from contextvars import ContextVar

request_id: ContextVar[str] = ContextVar('request_id', default='')

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request_id.set(rid)
    logger.configure(extra={"request_id": rid})
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response

# Usage in services:
logger.info("Processing design asset", extra={"design_id": design_id})
```

**Acceptance Criteria:**
- [ ] Mỗi request có unique request ID
- [ ] Request ID xuất hiện trong tất cả log entries
- [ ] Response headers chứa request ID

#### [MEDIUM] Sentry Integration for Error Tracking
**File:** `BE/app/main.py`
**Priority:** P1
**Effort:** 0.5 day

**Mô tả:** Sentry đã được add vào dependencies (`sentry-sdk[fastapi]>=2.0.0`), cần init.

**Implementation:**
```python
# BE/app/main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastAPIIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    integrations=[FastAPIIntegration()],
    environment=os.getenv("APP_ENV"),
    traces_sample_rate=0.1,
)

@app.on_event("startup")
async def startup():
    logger.info("Starting KusShoes Backend")
    # Existing startup code
```

**Acceptance Criteria:**
- [ ] Sentry DSN configured in environment
- [ ] Errors tự động được capture với stack traces
- [ ] Performance transactions được gửi

### 2.2 Frontend Error Handling

#### [HIGH] Global Error Boundary
**Files:** `FE/src/main.tsx`, `FE/src/components/Layout/ErrorBoundary.tsx`
**Priority:** P1
**Effort:** 1 day

**Mô tả:** Wrap App với ErrorBoundary để catch unhandled errors.

**Changes:**
```tsx
// FE/src/main.tsx
import { ErrorBoundary } from './components/Layout/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
```

**Acceptance Criteria:**
- [ ] Unhandled errors hiển thị fallback UI thay vì crash
- [ ] Error được log với stack trace
- [ ] User có option để reload app

#### [HIGH] Toast Notifications for API Errors
**Files:** `FE/src/api/client.ts`, `FE/src/context/ToastContext.tsx`
**Priority:** P1
**Effort:** 1 day

**Mô tả:** Tự động hiển thị toast khi API errors xảy ra.

**Implementation:**
```tsx
// FE/src/api/client.ts
import { toast } from '../context/ToastContext';

async handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await this.parseError(response);
    if (response.status >= 500) {
      toast.error('Server error. Please try again later.');
    } else if (response.status === 401) {
      toast.error('Session expired. Please login again.');
    }
    throw new ApiError(error.message, response.status);
  }
  return response.json();
}
```

**Acceptance Criteria:**
- [ ] 4xx errors hiển thị user-friendly message
- [ ] 5xx errors hiển thị generic error message
- [ ] Toast auto-dismiss sau 5 seconds

---

## Phase 3: Code Quality (Week 2-3)

### 3.1 Frontend Refactoring

#### [HIGH] Split Large Components
**Files:** `FE/src/pages/**/*.tsx`
**Priority:** P1
**Effort:** 3 days

**Mô tả:** Các page components quá lớn, cần tách thành sub-components.

**Action Items:**
| File | Lines | Target | Actions |
|------|-------|--------|---------|
| `Dashboard/Dashboard.tsx` | Review needed | <300 lines | Extract `DashboardStats`, `RecentProjects`, `QuickActions` |
| `ProductsPage/ProductsPage.tsx` | Review needed | <300 lines | Extract `ProductGrid`, `ProductFilters`, `ProductCard` |
| `Admin/Dashboard/AdminDashboard.tsx` | Review needed | <300 lines | Extract admin-specific components |

**Acceptance Criteria:**
- [ ] Mỗi component có single responsibility
- [ ] Components có props interface rõ ràng
- [ ] Storybook stories cho các components chính (optional)

#### [MEDIUM] Add Component Library Structure
**Files:** `FE/src/components/`
**Priority:** P2
**Effort:** 2 days

**Mô tả:** Tổ chức components theo domain/radiance pattern.

```
FE/src/components/
├── ui/           # Base components (Button, Input, Card)
├── layout/       # Layout components (AppShell, Sidebar, Navbar)
├── domain/       # Domain-specific (ProductCard, UserAvatar)
└── shared/       # Shared utilities (ErrorBoundary, LoadingSpinner)
```

### 3.2 Backend Quality

#### [MEDIUM] API Documentation
**Files:** `BE/app/api/`, OpenAPI/Swagger
**Priority:** P2
**Effort:** 2 days

**Mô tả:** Thêm docstrings và examples cho API endpoints.

**Implementation:**
```python
@router.post("/designs", response_model=DesignSchema)
async def create_design(
    design: DesignCreate,
    current_user: User = Depends(get_current_user)
) -> Design:
    """
    Create a new shoe design.
    
    Args:
        design: Design data including name and configuration
        
    Returns:
        Created design with generated ID
        
    Raises:
        401: If user is not authenticated
        422: If design data is invalid
    """
    # implementation
```

**Acceptance Criteria:**
- [ ] Tất cả endpoints có docstrings
- [ ] Swagger UI hiển thị examples
- [ ] Request/Response schemas có descriptions

---

## Phase 4: Testing (Week 3-4)

### 4.1 Backend Tests

#### [HIGH] Increase Test Coverage
**Files:** `BE/tests/`
**Priority:** P1
**Effort:** 5 days

**Mô tả:** Hiện tại có unit tests cho critical paths, cần tăng coverage.

**Target Coverage:**
| Module | Current | Target |
|--------|---------|--------|
| `app/api/` | ~60% | 80% |
| `app/services/` | ~70% | 85% |
| `app/models/` | ~50% | 70% |

**Priority Test Cases:**
1. Authentication flow (login, register, refresh, logout)
2. Design CRUD operations
3. Project permissions
4. Billing integration (Polar SDK)
5. File upload/asset handling
6. Error scenarios (invalid input, unauthorized access)

#### [MEDIUM] Integration Tests
**Files:** `BE/tests/test_integration/`
**Priority:** P2
**Effort:** 3 days

**Mô tả:** Add integration tests với test database.

```python
# BE/tests/conftest.py
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

@pytest.fixture
async def test_db():
    engine = create_async_engine("postgresql+asyncpg://test:test@localhost/test_db")
    # Create tables
    yield engine
    # Cleanup
```

### 4.2 Frontend Tests

#### [HIGH] Unit Tests for Critical Components
**Files:** `FE/src/**/*.test.ts`, `FE/src/**/*.test.tsx`
**Priority:** P1
**Effort:** 5 days

**Mô tả:** Add Vitest và test các critical components.

**Setup:**
```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react
```

**Test Priority:**
1. `api/client.ts` - API client methods
2. `utils/validators.ts` - Form validation
3. `utils/authValidation.ts` - Auth validation
4. `hooks/useAsyncData.ts` - Custom hooks
5. Page components (Login, Dashboard, ProductsPage)

**Target Coverage:** 60% overall, 80% for utils/hooks

#### [MEDIUM] E2E Tests with Playwright
**Files:** `FE/e2e/`
**Priority:** P2
**Effort:** 5 days

**Mô tả:** Add Playwright cho E2E testing.

**Critical User Flows to Test:**
1. User registration and login
2. Create and customize a product
3. Admin: Manage users and projects
4. Billing: Subscribe to a plan
5. Logout and session handling

---

## Phase 5: CI/CD & Deployment (Week 4)

### 5.1 Backend CI/CD

#### [HIGH] Docker Build & Push Pipeline
**File:** `.github/workflows/backend-ci.yml`
**Priority:** P1
**Effort:** 1 day

**Mô tả:** Thêm Docker build vào CI pipeline.

**Addition to backend-ci.yml:**
```yaml
- name: Build Docker image
  run: |
    docker build -t kusshoes-backend:${{ github.sha }} backend/
    
- name: Push to Registry
  if: github.ref == 'refs/heads/main'
  run: |
    docker tag kusshoes-backend:${{ github.sha }} registry/kusshoes-backend:latest
    docker push registry/kusshoes-backend:latest
  env:
    REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}
```

#### [MEDIUM] Staging Deployment
**Files:** `deploy/`, GitHub Actions
**Priority:** P2
**Effort:** 2 days

**Mô tả:** Setup automatic deployment to staging environment.

### 5.2 Frontend CI/CD

#### [HIGH] Lint & Format Enforcement
**Files:** `FE/package.json`, `FE/.eslintrc`, `FE/.prettierrc`
**Priority:** P1
**Effort:** 0.5 day

**Mô tả:** Cấu hình linting rules và pre-commit hooks.

**Implementation:**
```bash
npm install -D eslint prettier eslint-plugin-react eslint-config-prettier
npx husky install
npx lint-staged
```

**Update package.json:**
```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\""
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.css": ["prettier --write"]
  }
}
```

#### [MEDIUM] Deployment to CDN
**Files:** GitHub Actions, Vercel/Netlify
**Priority:** P2
**Effort:** 1 day

**Mô tả:** Setup automatic deployment cho frontend.

---

## Phase 6: Monitoring & Observability (Week 4-5)

### 6.1 Backend Monitoring

#### [HIGH] Health Check Endpoint Enhancement
**File:** `BE/app/api/system.py`
**Priority:** P1
**Effort:** 0.5 day

**Mô tả:** Mở rộng health check để include dependencies.

```python
@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    checks = {
        "database": await check_database(db),
        "redis": await check_redis(),
        "s3": await check_s3(),
    }
    all_healthy = all(c["status"] == "healthy" for c in checks.values())
    return {
        "status": "healthy" if all_healthy else "degraded",
        "checks": checks,
        "version": os.getenv("APP_VERSION", "unknown")
    }
```

#### [MEDIUM] Prometheus Metrics
**Files:** `BE/app/metrics.py`
**Priority:** P2
**Effort:** 1 day

**Mô tả:** Expose Prometheus metrics for monitoring.

### 6.2 Frontend Monitoring

#### [MEDIUM] Error Tracking (Sentry)
**Files:** `FE/src/main.tsx`
**Priority:** P2
**Effort:** 0.5 day

**Mô tả:** Frontend Sentry integration.

```tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [new Sentry.BrowserTracing()],
  tracesSampleRate: 0.1,
});

<Sentry.ErrorBoundary fallback={<ErrorFallback />}>
  <App />
</Sentry.ErrorBoundary>
```

---

## Implementation Timeline

```
Week 1: Critical Security Fixes
├── Rate Limiting (1 day)
├── JWT Token Security (2 days)
└── File Upload Sanitization (1 day)

Week 2: Error Handling
├── Structured Logging (1 day)
├── Global Error Boundary (1 day)
├── Toast Notifications (1 day)
└── Frontend Security (1 day)

Week 3: Code Quality & Testing
├── Component Refactoring (3 days)
├── Backend API Docs (2 days)
└── Unit Tests Setup (2 days)

Week 4: CI/CD & Deployment
├── Docker Pipeline (1 day)
├── Lint Enforcement (0.5 day)
├── Staging Deployment (2 days)
└── Frontend Deployment (1 day)

Week 5: Monitoring
├── Health Check Enhancement (0.5 day)
├── Prometheus Metrics (1 day)
├── Sentry Frontend (0.5 day)
└── Dashboard Setup (1 day)

Total: ~5 weeks
```

---

## Definition of Done

### Production Ready Checklist

- [ ] **Security**
  - [ ] Rate limiting on all public endpoints
  - [ ] Tokens in httpOnly cookies
  - [ ] Input validation on all endpoints
  - [ ] Security audit passed

- [ ] **Stability**
  - [ ] Global error handling (backend + frontend)
  - [ ] Retry logic for transient failures
  - [ ] Health checks for all dependencies

- [ ] **Testing**
  - [ ] Unit test coverage > 60%
  - [ ] Integration tests for critical paths
  - [ ] E2E tests for user flows

- [ ] **Monitoring**
  - [ ] Structured logging with request IDs
  - [ ] Error tracking (Sentry)
  - [ ] Performance metrics
  - [ ] Alerting configured

- [ ] **Deployment**
  - [ ] Docker images built and pushed
  - [ ] Staging environment automated
  - [ ] Rollback procedure documented
  - [ ] Runbook for common issues

---

## Appendix: File Locations Reference

### Backend Key Files
```
BE/
├── app/
│   ├── api/
│   │   ├── auth.py           # Authentication endpoints
│   │   ├── designs.py        # Design CRUD
│   │   ├── projects.py       # Project management
│   │   └── system.py        # Health checks
│   ├── core/
│   │   ├── security.py      # JWT, password hashing
│   │   └── config.py         # Environment config
│   ├── models/               # SQLAlchemy models
│   ├── schemas/              # Pydantic schemas
│   ├── services/             # Business logic
│   └── main.py               # FastAPI app entry
├── tests/
│   └── conftest.py           # Pytest fixtures
└── pyproject.toml
```

### Frontend Key Files
```
FE/
├── src/
│   ├── api/
│   │   └── client.ts         # API client
│   ├── components/
│   │   ├── Layout/           # Layout components
│   │   └── ...               # Other components
│   ├── context/
│   │   └── ToastContext.tsx  # Toast notifications
│   ├── pages/
│   │   ├── Dashboard/        # Dashboard page
│   │   ├── ProductsPage/     # Products page
│   │   └── Admin/            # Admin pages
│   ├── hooks/                 # Custom hooks
│   └── main.tsx              # App entry
├── package.json
└── vite.config.ts
```

---

## Contact & Questions

For clarifications or questions about this roadmap, contact:
- Backend: Backend Team Lead
- Frontend: Frontend Team Lead
- DevOps: Infrastructure Team
