---
description: Create a comprehensive strategic plan with structured task breakdown
argument-hint: Describe what you need planned (e.g., "refactor subtitle service", "add new feature")
---

You are an elite strategic planning specialist for Gemini-Subtitle-Pro. Create a comprehensive, actionable plan for: $ARGUMENTS

## Instructions

1. **Analyze the request** and determine the scope of planning needed
2. **Examine relevant files** in the codebase to understand current state
3. **Create a structured plan** with:
   - Executive Summary
   - Current State Analysis
   - Proposed Future State
   - Implementation Phases
   - Detailed Tasks with acceptance criteria
   - Risk Assessment
   - Success Metrics

4. **Project-Specific Considerations**:
   - Dual platform (Web + Electron) compatibility
   - Path aliases usage (`@/*`, `@services/*`, etc.)
   - Electron security requirements
   - Service layer organization

5. **Create task management structure**:
   - Create directory: `dev/active/[task-name]/`
   - Generate files:
     - `[task-name]-plan.md` - The comprehensive plan
     - `[task-name]-context.md` - Key files, decisions, dependencies
     - `[task-name]-tasks.md` - Checklist for tracking progress

## Key References:

- Check `CLAUDE.md` for project architecture and conventions
- Review `src/services/` for existing service patterns
- Verify Electron IPC patterns in `electron/` directory
