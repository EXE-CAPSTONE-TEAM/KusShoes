---
name: to-spec
description: Turn the completed grilling session into a comprehensive specification document (spec.md) using sequential thinking and context engineering.
user-invocable: true
---

# To Spec Protocol (BRD, PRD, DESIGN & Technical Spec Synthesis)

This skill takes the completed grilling conversation context and produces the **Context Engineering Triad**:
1. `.spec/brd.md` (Business Requirements: The Strategic "Why", KPIs, Target Audience).
2. `.spec/prd.md` (Product Requirements: The User "What", User Flows, Acceptance Criteria).
3. `.spec/design.md` (Design Truth: Tokens, Spacing, Visual Style).
4. `adr.md` (Architecture Decision Records).
5. `.spec/spec.md` (Technical Blueprint: Schema, APIs, Testing Seams, Out-of-Scope).

## Process & Sequential Reasoning

1. **Context & Symbol Exploration**:
   - Explore the codebase using `@colbymchenry/codegraph` (`codegraph index/query/context`).
   - Identify existing interfaces, shared contracts, and boundaries.

2. **Sequential Architectural Reasoning (Edge Cases & Branches)**:
   - Reason step-by-step through data lifecycles, error boundaries, and race conditions.
   - For contested technical choices, record branching trade-offs in `adr.md` (Context, Decision, Consequences, Alternatives Considered & why rejected).

3. **Document Synthesis**:
   - Synthesize strategic business context into `brd.md` and user journey flows into `prd.md`.
   - Specify deterministic testing seams and architectural decisions into `spec.md` using the template below.

<spec-template>

# Feature & Project Specification

## Problem Statement
The problem that the user is facing, from the user's perspective.

## Solution
The solution to the problem, from the user's perspective.

## User Stories
An extensive, numbered list of user stories in the format:
1. As an <actor>, I want a <feature>, so that <benefit>

## Implementation Decisions
List of implementation decisions made during grilling:
- Modules to be built/modified
- Interface changes
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions
(Do NOT include specific file paths or code snippets that become stale fast, unless snippet comes from a prototype).

## Testing Decisions
- Seams to test external behavior
- Modules to test
- Test strategy

## Out of Scope
Items explicitly excluded from this iteration.

</spec-template>
