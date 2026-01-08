---
name: release-version
description: Use when releasing a new version - guides through version bump, changelog generation, commit grouping, tagging, and GitHub CI tracking. Triggers on "发布新版本", "release", "发版", or version release requests.
---

# Release Version Workflow

## Overview

A complete release workflow for Gemini-Subtitle-Pro that handles version bumping, changelog generation from git history, grouped commits, tagging, and GitHub CI monitoring.

## When to Use

- User says "发布新版本", "release", "发版"
- User requests a version release
- Before publishing a new release to GitHub

## Workflow Steps

### Step 0: Pre-flight Questions

Ask the user:

1. **Version number** - What version to release? (e.g., 2.12.0)
2. **Pre-release?** - Is this a pre-release version? (affects GitHub release settings)

### Step 1: Check and Commit Uncommitted Changes

1. Run `git status` to check for uncommitted changes
2. If changes exist:
   - Analyze the changes by topic/feature
   - Group related changes together
   - Create separate commits for each topic group
   - Use conventional commit messages (feat:, fix:, chore:, etc.)

### Step 2: Generate Changelog

1. Find the previous version tag:

   ```bash
   git describe --tags --abbrev=0
   ```

2. Get all commits since last tag:

   ```bash
   git log <previous-tag>..HEAD --oneline
   ```

3. Read each commit's details to categorize:
   - **Features** - New functionality (feat:)
   - **Fixes** - Bug fixes (fix:)
   - **Refactor** - Code improvements (refactor:)
   - **Chore** - Maintenance tasks (chore:)
   - **Documentation** - Doc updates (docs:)
   - **Performance** - Performance improvements (perf:)

4. Update `CHANGELOG.md`:
   - Add new version section at the top (after header)
   - Format: `## [X.X.X] - YYYY-MM-DD` (no 'v' prefix)
   - Group entries by category (Keep a Changelog format)

5. Update `package.json`:
   - Change `"version": "X.X.X"` to new version (no 'v' prefix)

### Step 3: Commit Release Files

```bash
git add CHANGELOG.md package.json
git commit -m "Release vX.X.X"
```

Note: Commit message uses 'v' prefix, but version strings in files do not.

### Step 4: Tag and Push

```bash
git tag vX.X.X
git push origin main
git push origin vX.X.X
```

Note: Tag uses 'v' prefix (e.g., v2.12.0).

### Step 5: Monitor GitHub CI

1. Track the GitHub Actions workflow:

   ```bash
   gh run list --workflow=release.yml --limit=1
   gh run watch <run-id>
   ```

2. Report build status to user:
   - Success: Provide release URL
   - Failure: Show error details

## Quick Reference

| Step         | Command                          | Purpose                    |
| ------------ | -------------------------------- | -------------------------- |
| Check status | `git status`                     | Find uncommitted changes   |
| Previous tag | `git describe --tags --abbrev=0` | Get last release tag       |
| Commit log   | `git log <tag>..HEAD --oneline`  | List changes since release |
| Create tag   | `git tag vX.X.X`                 | Create version tag         |
| Push tag     | `git push origin vX.X.X`         | Trigger CI build           |
| Watch CI     | `gh run watch`                   | Monitor build progress     |

## Version Format Rules

| Location       | Format          | Example                    |
| -------------- | --------------- | -------------------------- |
| Git tag        | With 'v' prefix | `v2.12.0`                  |
| Commit message | With 'v' prefix | `Release v2.12.0`          |
| CHANGELOG.md   | No 'v' prefix   | `## [2.12.0] - 2026-01-06` |
| package.json   | No 'v' prefix   | `"version": "2.12.0"`      |

## CHANGELOG Format

```markdown
## [X.X.X] - YYYY-MM-DD

### Features

- **Component**: Description of new feature.

### Fixes

- **Component**: Description of bug fix.

### Refactor

- **Component**: Description of refactoring.

### Chore

- **Component**: Maintenance description.
```

## Common Mistakes

| Mistake                       | Fix                                                         |
| ----------------------------- | ----------------------------------------------------------- |
| Forgetting to push the tag    | CI only triggers on tag push, not commit push               |
| Wrong version in package.json | Version must match tag (without 'v' prefix)                 |
| Changelog in wrong position   | New version goes after the header, before previous versions |
| Not grouping commits          | Related changes should be in one commit for cleaner history |
| Inconsistent 'v' prefix       | Tag and commit use 'v', files don't                         |

## Pre-release Handling

For pre-release versions:

- Use version format: `X.X.X-beta.1`, `X.X.X-rc.1`
- Tag format: `vX.X.X-beta.1`
- Note: Current CI workflow sets `prerelease: false` - may need manual adjustment in GitHub release
