---
name: session-subagents
description: Multi-agent Worker-Critic-Synthesizer orchestration inside an AGY implementation session with In-Project Level 3 Harness verification.
user-invocable: true
---

# Session Sub-Agent Orchestration Protocol

Inside an Antigravity TUI (`agy`) implementation session in `projects/<project_name>`, use this protocol to partition complex tickets across specialized sub-agents, enforce rigorous review via two dedicated critics, and verify against the project test harness.

---

## 1. Role Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │        AGY Primary Session (Orchestrator)     │
                       │   - Reads .spec/spec.md & .spec/tasks.md     │
                       │   - Freezes Interface / Type Contracts       │
                       │   - Aggregates code & runs ./harness/verify.sh│
                       └──────────────┬───────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
   │  Worker 1: Core    │   │  Worker 2: API/IO  │   │  Worker 3: UI/Infra│
   │  - Domain logic    │   │  - Integration     │   │  - Schemas/fixtures│
   └──────────┬─────────┘   └──────────┬─────────┘   └──────────┬─────────┘
              └───────────────────────┼───────────────────────┘
                                      ▼
                       ┌──────────────────────────────┐
                       │  Two-Tier Critic Evaluation  │
                       ├──────────────────────────────┤
                       │ Critic 1: Functional & Tests │
                       │ Critic 2: Security & Quality │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │   In-Project Level 3 Harness │
                       │    (./harness/verify.sh)     │
                       └──────────────────────────────┘
```

### Roles & Responsibilities
* **Primary AGY (Orchestrator & Synthesizer):**
  * Holds session state and reads the Source of Truth (`.spec/spec.md`, `.spec/tasks.md`).
  * Freezes data models and function signatures before worker dispatch.
  * Dispatches subagents via `invoke_subagent`.
  * Merges outputs, resolves integration friction, and executes `./harness/verify.sh`.
* **Worker Sub-Agents (1 to 3 agents, angle-specific):**
  * *Worker 1 (Core / Domain):* Implements internal algorithms, data state, and core business rules.
  * *Worker 2 (API / Endpoints / Integration):* Implements external routes, serialization, clients, and controllers.
  * *Worker 3 (Infra / Fixtures / UI):* Implements database migrations, UI components, and mock fixtures.
* **Critic Sub-Agents (2 orthogonal critics):**
  * *Critic 1 (Correctness & Functional Testing):* Validates implementation strictly against `.spec/spec.md` acceptance criteria; writes unit/integration tests to expose edge cases.
  * *Critic 2 (Security, Architecture & Code Quality):* Audits against injection, auth bypass, race conditions, memory leaks, and lint standards.

---

## 2. Adaptive Complexity Matrix (When to Spawn)

Do not spawn sub-agents blindly. Evaluate ticket scope before dispatching:

| Ticket Complexity | Criteria | Topology |
| :--- | :--- | :--- |
| **Small / Localized** | 1–2 files, localized bugfix, single function edit | Single AGY (Direct execution + `./harness/verify.sh`) |
| **Medium / Two-layer** | Core logic + API route or new schema + test suite | 1 Worker + 1 Critic (Correctness) + AGY verify |
| **Complex / Multi-layer** | Cross-cutting vertical slice across schema, API, UI, tests | 2–3 Workers + 2 Critics (Functional + Security) + AGY Synthesis |

---

## 3. Step-by-Step Execution Lifecycle

### Step 1: Contract Freeze (Interface-First)
Before invoking workers, AGY inspects `.spec/spec.md` and freezes:
1. Type definitions / TypeScript interfaces / Pydantic models.
2. REST / GraphQL / RPC endpoint signatures and schemas.
3. Database table definitions.
*Rule: Workers cannot alter frozen contracts without orchestrator consensus.*

### Step 2: Dispatch Workers via `invoke_subagent`
AGY spawns parallel workers with distinct, non-overlapping file scopes:
```json
{
  "Subagents": [
    {
      "TypeName": "self",
      "Role": "Core Domain Worker",
      "Prompt": "Implement core logic in src/core/ based on .spec/spec.md Section 3. Follow frozen types in src/types/."
    },
    {
      "TypeName": "self",
      "Role": "API Route Worker",
      "Prompt": "Implement API controllers in src/api/ using frozen interfaces. Do not modify src/core/ directly."
    }
  ]
}
```

### Step 3: Dispatch Two-Tier Critics
Once workers return code, AGY launches the two Critic sub-agents:
1. **Critic 1 (Functional & Seam Tests):**
   * Review code diffs vs `.spec/tasks.md` acceptance criteria.
   * Write edge-case tests under `tests/`.
2. **Critic 2 (Security, Quality & Data Provenance):**
   * Inspect for OWASP vulnerabilities, unsafe casts, error handling gaps.
   * Run static analysis / lint rules.
   * **Data provenance audit** — read the diff, not the test results, and answer:
     - [ ] Does any function return a literal where the spec calls for a computation?
     - [ ] Is every new constant, threshold, weight, timeout and buffer size declared in
           `config/` or `constants/` with a comment giving its basis (formula, citation,
           or the measured run it came from)?
     - [ ] Does any number presented as a measurement appear in source rather than being
           read from a run artifact?
     - [ ] Do Critic 1's tests constrain behaviour across a *range* of inputs, or do they
           only re-assert the literals already present in the source?
   * Anything that fails these is `CHANGES_REQUESTED`, regardless of harness exit code.
     `./harness/verify.sh` runs `audit-provenance` mechanically; Critic 2 covers what a
     static check cannot — whether the value is *right*, not merely whether it is annotated.

### Step 4: AGY Synthesis & In-Project Level 3 Harness
1. AGY reconciles worker code and critic suggestions.
2. AGY executes the project verification harness:
   ```bash
   ./harness/verify.sh
   ```
3. **Outcome:**
   * **Exit Code 0:** Mark the ticket `[~] PENDING_REVIEW` in `.spec/tasks.md` and hand off to the
     **Stage 5.5 Claude Code Sign-off Gate** (`rules/task-routing.md`). AGY never writes `[x]` —
     only Claude Code grants it, after an independent audit. A green harness proves the tests AGY
     wrote agree with the code AGY wrote; it is not evidence the ticket is done.
   * **Failure (Attempt 1):** AGY fixes identified failures and re-runs `./harness/verify.sh`.
   * **Failure (Attempt 2):** Stop loop. Escalate to Claude Code with handoff packet per `rules/task-routing.md`.

4. **Handoff packet** (required for the gate): ticket ID, files touched, `git diff --stat`, the
   harness log path under `.spec/verification-log/`, and — for every constant, threshold or metric
   introduced — where its value came from.
