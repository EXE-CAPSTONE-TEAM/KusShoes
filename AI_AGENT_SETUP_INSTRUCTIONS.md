# AI Agent Instruction Manual: KusShoes FE-BE Local Integration Setup

**System Prompt / Guidelines for AI Coding Assistants (Copilot, Cursor, Gemini, Claude, etc.)**

**Goal:** Configure and link the KusShoes Frontend (FE) repository with the Backend (BE) repository for local development. This setup strictly resolves CORS errors and `SameSite=Lax` cross-origin cookie drops that cause infinite redirect loops between the Marketing Site and the Web Editor.

## 🏗️ System Architecture Context
- **Marketing Frontend (FE):** Runs locally on `http://localhost:5173`.
- **Backend API (BE):** Runs via Docker on `http://localhost:8000`.
- **Studio Web Editor (BE/frontend):** Runs via Docker on `http://localhost:5180`.

---

## 🛠️ Execution Steps for AI Agent

As an AI Agent, please read and execute the following 4 steps precisely in the user's workspace using your file-editing and terminal-execution capabilities.

### Step 1: Whitelist Web Editor in Backend CORS
**Target File:** `BE/ar-ai-exe/deploy/backend.dev.env`
**Action:** The Web Editor (`5180`) must be explicitly whitelisted, otherwise `GET /api/auth/me` will fail CORS, causing a redirect loop.
1. Read the file. If `backend.dev.env` does not exist, copy it from `backend.dev.env.example`.
2. Locate the `CORS_ORIGINS` array.
3. Ensure the array contains EXACTLY these origins (specifically `5180`):
```env
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","http://localhost:5180","http://127.0.0.1:5180","http://localhost:3000","http://127.0.0.1:3000","http://localhost:80"]
```

### Step 2: Route Web Editor's Login to Marketing FE
**Target File:** `BE/ar-ai-exe/frontend/src/App.tsx`
**Action:** When a user's session expires in the Web Editor, it must bounce them back to the Marketing FE.
1. Find the declaration of `MARKETING_LOGIN_URL`.
2. Ensure the fallback defaults to port `5173`:
```typescript
const MARKETING_LOGIN_URL = import.meta.env.VITE_MARKETING_LOGIN_URL ?? "http://localhost:5173/login";
```

### Step 3: Enforce Uniform Hostnames for Cookie Sharing
**Target File:** `BE/ar-ai-exe/frontend/src/api/runtimeConfig.ts`
**Action:** Prevent `SameSite=Lax` cookie loss. If the browser URL uses `localhost`, the API requests must also use `localhost` (not `127.0.0.1`).
1. Find the declaration of `DEFAULT_API_BASE_URL`.
2. Replace it entirely with this dynamic resolution block:
```typescript
let envBaseUrl = import.meta.env.VITE_API_BASE_URL;
if (!envBaseUrl || envBaseUrl.includes("localhost") || envBaseUrl.includes("127.0.0.1")) {
  // Dynamically inherit 'localhost' or '127.0.0.1' from the browser's address bar
  envBaseUrl = `http://${window.location.hostname}:8000`;
}
const DEFAULT_API_BASE_URL = envBaseUrl;
```

### Step 4: Apply Changes via Docker
**Action:** Execute the following bash/powershell commands in the terminal to recreate the backend container (applying the `.env` changes) and flush the frontend Vite cache.
**Working Directory:** `BE/ar-ai-exe/`
```bash
docker compose -f docker-compose.dev.yml up -d backend
docker compose -f docker-compose.dev.yml restart frontend
```

---

## 💬 Final Instructions to Output to the Human User

Once you (the AI Agent) have completed the codebase modifications and restarted the containers, please print the following exact message to your human user:

> **✅ Setup Complete!**
> The FE and BE have been successfully connected. To prevent cookie issues, please follow these rules:
> 1. **ALWAYS** access the site via `http://localhost:5173/login` (Do **NOT** type `127.0.0.1` in your browser).
> 2. Open your browser's Developer Tools (Network Tab), check **"Disable cache"** (or press Ctrl+F5) to clear any old CORS failures.
> 3. Log in again. The infinite loop should now be completely resolved.
