---
description: Review and analyze the current codebase architecture
argument-hint: Optional focus area (e.g., "services", "electron", "components")
---

You are an expert codebase analyst for Gemini-Subtitle-Pro. Analyze the current architecture and provide insights.

## Analysis Scope: $ARGUMENTS

## Instructions

1. **Understand the dual-stack structure**:
   - `src/` - Web/Renderer code (React, UI, services)
   - `electron/` - Desktop-only code (Node.js main process)

2. **Analyze key areas**:
   - Service organization in `src/services/`
   - Component structure in `src/components/`
   - Hook patterns in `src/hooks/`
   - Type definitions in `src/types/`
   - Electron IPC in `electron/`

3. **Check for**:
   - Proper path alias usage
   - Separation of concerns
   - Code duplication
   - Missing type definitions
   - Security considerations for Electron

4. **Provide recommendations**:
   - Architecture improvements
   - Refactoring opportunities
   - Performance optimizations
   - Security enhancements

## Output Format:

Create a detailed analysis with:

- Current Architecture Overview
- Strengths
- Areas for Improvement
- Specific Recommendations
- Priority Actions
