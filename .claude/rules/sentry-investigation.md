# Sentry Issue Investigation Workflow

Investigation records are maintained in a **separate git repository**:

- **Local path**: `docs/sentry-investigations/` (gitignored from main repo)
- **Remote**: `https://github.com/corvo007/sentry-investigations.git`

**After creating/updating investigation files, always commit and push:**

```bash
cd docs/sentry-investigations
git add -A
git commit -m "investigate: MIOSUB-X [brief description]"
git push
```

## 1. Triage New Issues

```
1. Get latest issues: search_issues("unresolved issues from last 7 days")
2. Check README.md index - is this a known issue or duplicate?
3. If new: create issues/MIOSUB-X.md from template
4. If duplicate: update existing file with new event data
5. Add investigation entry to the CURRENT WEEK file (week-2026-WXX.md)
   - If the issue was first investigated in an earlier week, add to that week's "Late Updates" section instead
```

## 2. Investigation Process

```
1. Get full details: get_issue_details(issueId)
2. Analyze patterns: get_issue_tag_values(issueId, "user"), etc.
3. ⚠️ VERSION CHECK: Before analyzing ANY code path, verify it existed
   at the crash version using: git show <release-tag>:<file>
   NEVER reason about HEAD code for older version crashes.
4. Check for related issues (same user, same trace_id)
5. Review docs/analytics-events.md for relevant tracking fields
   - Check if user actions before error were tracked
   - Look for related events (e.g., generation_started before generation_failed)
   - Use Amplitude/Mixpanel to query these events for the affected user
6. Cross-reference with Amplitude/Mixpanel
7. Document in issue file:
   - Initial hypothesis
   - Investigation steps
   - Intermediate conclusions
   - Final conclusion
```

## ⚠️ CRITICAL: Documentation Rules

**Investigation records are append-only. NEVER delete or overwrite previous analysis.**

1. **Conclusions can only be ADDED, never deleted**
   - Keep initial hypothesis even if proven wrong
   - Keep intermediate conclusions even if superseded
   - Add new conclusions with updated evidence

2. **Every conclusion MUST have a complete evidence chain**
   - What query was executed (tool name + parameters)
   - What data was returned (raw results)
   - How the data supports the conclusion
   - Example:
     ```
     Query: mcp__mixpanel__run_segmentation_query(
       project_id: 3985897,
       event: "end_to_end_generation_started",
       where: 'properties["$user_id"] == "xxx"'
     )
     Result: {"values": {"true": {"2026-02-01": 2}}}
     Conclusion: User was using third-party API (is_third_party_gemini=true)
     ```

3. **Document the reasoning process, not just the result**
   - Why did you check this data source?
   - What alternatives were considered?
   - Why were they ruled out?

4. **ALWAYS verify code at crash version before reasoning about code paths**
   - Use `git show <release-tag>:<file>` to see actual code at the crash version
   - NEVER analyze HEAD code and assume it existed in older versions
   - When a log is "missing", first check: did the code producing that log exist at the crash version?
   - This prevents wasting hours investigating false hypotheses based on code that wasn't deployed yet

## 3. After Fix Applied

```
1. Update issue file: Status → "✅ Fixed (pending vX.X.X)"
2. Update README.md:
   - Version Fix Tracking table
   - Quick Stats
3. Update the issue's week file (where it was first investigated) with fix details
4. If cascade error: note which upstream fix resolves it
```

## 4. Before Release

```
1. Review all "✅ Fixed (pending)" issues
2. Update status → "🚀 Released in vX.X.X"
3. Update Version Fix Tracking table with release date
4. Close issues in Sentry: update_issue(issueId, status="resolved")
```

## 5. After Release (Monitoring)

```
1. Check if fixed issues reoccur → mark as "🔄 Regressed"
2. Update Regression Tracking table
3. Investigate regression cause
```

## Issue File Template

```markdown
# MIOSUB-X: [Title]

**URL**: https://corvo007.sentry.io/issues/MIOSUB-X
**Status**: [❌ Open | ✅ Fixed | 🚀 Released | ⏭️ Won't Fix | ⬆️ Upstream]
**Priority**: [P0-P3]
**Events**: X | **Users**: X

## Related Issues

| Relation | Issue | Description |
| -------- | ----- | ----------- |

## Event Breakdown

[Fine-grained breakdown - same issue can have different causes]

## Investigation

### Initial Hypothesis

### Investigation Steps

### Final Conclusion

## Fix Applied / Recommended Fix
```
