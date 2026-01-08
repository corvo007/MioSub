---
trigger: always_on
glob:
description:
---

# Coding Guidelines & Operational Rules

## 1. Critical Safety & Integrity Rules (Level 0)

> [!IMPORTANT]
> **READ & FOLLOW THESE FIRST**
> Non-compliance here directly leads to data loss, bugs, or security breaches.

1.  **Always Read First**: Before editing ANY file, you MUST read the entire file to get the latest status. Never rely on memory.
2.  **Small Batches**: Limit modifications to **50 lines** or fewer per edit. Risk increases exponentially with patch size.
3.  **Step-by-Step**: If a change requires more than 50 lines, break it down into multiple smaller steps.
4.  **Meticulousness**: Be extremely careful and double-check everything repeatedly.
5.  **Preserve Code**: Do NOT randomly change or delete code. Only modify what is necessary and requested.
6.  **Security**: Follow security best practices immediately to prevent vulnerabilities. Do not leave security for "later".
7.  **Environment**: Development environment is Windows 11 with PowerShell terminal.

## 2. Design & Strategy Rules (Level 1)

> [!TIP]
> **THINK BEFORE YOU CODE**
> Non-compliance here leads to technical debt, unmaintainable code, and "spaghetti" logic. 8. **Minimize Changes**: Do not over-design or perform massive refactoring for a small feature. Keep changes surgical. 9. **Sequential Thinking**: For complex refactoring or new logic, use `sequential-thinking` first to create a detailed plan. 10. **Use Context7**: Never guess APIs. Use `context7` to fetch the latest documentation before implementing dependencies. 11. **Reuse First (Occam's Razor)**: Leverage existing components/logic first. Composition > Creation. 12. **Extract Shared Code (DRY)**: Extract logic reused >2 times into a shared module (unless state-dependent). 13. **Explicit Data & Types**: Avoid ambiguous types (e.g., `any`, generic Object). Be explicit to ensure safety.

## 3. Quality & Hygiene Rules (Level 2)

> [!NOTE]
> **PROFESSIONAL STANDARDS**
> Adhering to these ensures code is clean, testable, and team-friendly. 14. **Error Handling**: Handle errors gracefully. Never swallow exceptions; use try/catch and log meaningful errors. 15. **Clean Code**: Remove unused imports, variables, and dead code immediately after edits. 16. **Testing**: Test your code thoroughly. Do not assume it works just because it compiles. 17. **Version Control**: Commit frequently with clear, descriptive messages. 18. **Commit Standards**: Use conventional formats (e.g., `feat:`, `fix:`) to clearly communicate changes. 19. **Code Reviews**: Write code as if it will be reviewed by a strict maintainer. 20. **Documentation**: Document complex logic clearly for future maintainers. 21. **Performance & Scalability**: Optimize for efficiency and design for future growth.

## Reasoning

- **Why Safety First? (Integrity)**: Editing without reading or making massive edits provides the highest probability of breaking the application immediately. We prioritize **stability** over speed.
- **Why Strategy? (Architecture)**: Over-designing or reinventing the wheel introduces unnecessary complexity that makes the codebase "uncontrollable" over time. We prioritize **maintainability** and **simplicity**.
- **Why Quality? (Hygiene)**: Unclean code, lack of tests, or poor error handling creates "soft rot" that slows down future development. We prioritize **long-term health**.
