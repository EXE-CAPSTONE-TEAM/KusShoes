---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea before writing any code. Synthesizes Socratic frontier questioning with brainstorming divergence and sequential-thinking revision.
user-invocable: true
---

# Grilling Protocol (Socratic Requirement Extraction 2.0)

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

## Phase 0: Divergence & Approach Exploration (Brainstorming Filter)
Before drilling down into granular frontier questions:
1. **Context First**: Check out the project state (files, docs, codegraph symbols) so you never ask the user for facts you can look up yourself.
2. **Propose 2-3 Macro Approaches**: If the core architecture or approach is unsettled, propose 2-3 viable approaches with explicit trade-offs and your recommended option leading with clear rationale.
3. **YAGNI Ruthlessly**: Actively challenge unnecessary complexity and prune out-of-scope features early.

## Phase 1: Sequential Frontier Traversal
Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet.

- **Pacing & Cognitive Load**: Avoid question flooding. Keep rounds focused (1–3 questions maximum per round), preferring multiple-choice options with a recommended default.
- Format each question:

```markdown
❓ **Q1** - **<question title>**: <question body, multiple choices preferred>

➡️ <your recommended answer and brief rationale>
```

- Finding _facts_ is your job, never the user's. Dispatch tools or subagents to look up codebase facts. The _decisions_ are the user's — put each to them and wait.

## Phase 2: Sequential Thinking & Revision Tracking
When managing the design tree:
- **Branch Exploration**: Clearly isolate alternative paths (e.g., Branch A vs Branch B) and evaluate them against constraints.
- **Revision & Backtracking**: If the user modifies an earlier assumption or decision, trigger an explicit **Revision**:
  1. Invalidate downstream decisions and open questions belonging to the superseded branch.
  2. Record the revised decision and recompute the frontier from the updated node.
  3. Never leave obsolete assumptions silently lingering in context.

## Phase 3: Incremental Validation (Checkpoints)
When presenting the synthesized understanding before proceeding to Spec / Tickets:
- Break the validated design into concise sections of **200–300 words** (Architecture & Data Flow, Component Boundaries, Error Seams & Testing, Out-of-Scope).
- Confirm alignment after each section.
- The session is done when the frontier is empty and the user explicitly confirms a shared understanding.
