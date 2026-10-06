---
name: to-tickets
description: Break a plan or spec into a set of tracer-bullet vertical slice tickets with sequential dependency verification.
user-invocable: true
---

# To Tickets Protocol (Sequential Tracer-Bullet Decomposition)

Break a spec or plan into **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

## Process & Sequential Dependency Verification

1. **Context Ingestion**: Gather context from `spec.md`, `adr.md`, and existing codebase symbols.
2. **Draft Vertical Slices (Tracer Bullets)**:
   - Each slice cuts a narrow but COMPLETE path through all layers (schema/data, core logic, API/UI, automated tests).
   - Each completed slice is demoable and independently verifiable via the Level 3 test harness (`./harness/verify.sh`).
   - Sized to fit comfortably in a single fresh context window (avoiding context bloat and mid-ticket degradation).
3. **Sequential Dependency Validation**:
   - Step through the tickets in topological order ($T_1 \to T_2 \dots \to T_n$).
   - Rigorously verify that Ticket $N$ requires *only* dependencies explicitly delivered and verified in prior tickets.
   - Explicitly declare blocking edges (`Blocked by: Ticket X`).
4. **Present Proposed Breakdown**:
   - Present a concise roadmap summary to the user for approval.
5. **Save to Storage**:
   - Save approved tickets to `.spec/tasks.md` and `.spec/issues/`.

<ticket-template>

### Ticket-[NN]: <Title>
- **What to build:** End-to-end behavior delivered from user perspective.
- **Blocked by:** [Ticket-XX] or "None (Can start immediately)"
- **Acceptance Criteria:**
  - [ ] Criterion 1
  - [ ] Criterion 2
- **Verification Seam:** Exact test or `./harness/verify.sh` target proving completion.

</ticket-template>
