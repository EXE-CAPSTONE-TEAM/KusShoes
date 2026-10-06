---
name: implement-with-agy
description: Bootstrap the in-project harness and hand off implementation to Antigravity TUI (agy) inside the project directory.
---

# Implement With AGY (Antigravity TUI) Protocol

When requirements grilling, spec creation, and ticket breakdown are approved by the user, follow this skill to execute the implementation via **Antigravity TUI (`agy`)** and the **In-Project Harness**.

## Process

1. **Bootstrap In-Project Harness**:
   Execute the harness initializer for the target project:
   ```bash
   /home/tak/openclaw/harness/init-project-harness.sh <project_name>
   ```

2. **Verify Project Scaffold**:
   Ensure the following files are present in `projects/<project_name>`:
   - `.spec/spec.md` (Approved requirements & architecture)
   - `.spec/tasks.md` (Vertical slice tickets)
   - `harness/verify.sh` (Configured test/lint harness)
   - `AGENTS.md` (Implementation rules for `agy`)

3. **Hand Off to AGY**:
   Instruct the user or launch `agy` in the project directory:
   ```bash
   cd /home/tak/openclaw/projects/<project_name> && agy
   ```
   Or launch with the first ticket prompt:
   ```bash
   cd /home/tak/openclaw/projects/<project_name> && agy -i "Implement Ticket-01 from .spec/tasks.md and verify with ./harness/verify.sh"
   ```
