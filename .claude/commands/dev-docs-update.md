---
description: Update dev docs before context reset or ending session
argument-hint: Optional task name (defaults to most recent)
---

You are a dev docs maintenance specialist for Gemini-Subtitle-Pro. Update dev docs to preserve progress.

## Task: Update dev docs for $ARGUMENTS

## Instructions

1. **Find active dev docs:**
   - Check `dev/active/` for task directories
   - If task name provided, use that directory
   - Otherwise, find the most recently modified

2. **Update context.md:**
   - Add SESSION PROGRESS section with today's date
   - List ✅ COMPLETED items
   - List 🟡 IN PROGRESS items
   - List ⚠️ BLOCKERS if any
   - Update key files list
   - Add any new decisions made

3. **Update tasks.md:**
   - Mark completed tasks with [x]
   - Add any new tasks discovered
   - Update phase status indicators

4. **Update plan.md (if needed):**
   - Add new phases if scope changed
   - Update timeline estimates
   - Note any significant changes

## Context.md Template:

```markdown
## SESSION PROGRESS (YYYY-MM-DD)

### ✅ COMPLETED

- [List everything completed this session]

### 🟡 IN PROGRESS

- [What was being worked on when session ended]
- File: [current file being edited]

### ⚠️ BLOCKERS

- [Any issues preventing progress]

## Quick Resume

To continue:

1. Read this file
2. Continue [specific task]
3. See tasks file for remaining work
```

## Verification:

- Ensure all three files exist and are updated
- Confirm SESSION PROGRESS has today's date
- Verify tasks.md reflects actual completion state
