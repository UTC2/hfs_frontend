# HFS Cleanup — Implementation Plans Index

**Project:** Cross-repo cleanup spanning `danghoangnhan/hfs_frontend` and `UTC2/hfs_backend`.
**Specs:** `../specs/2026-04-27-hfs-frontend-cleanup-design.md`, `../specs/2026-04-27-hfs-backend-fixes-design.md`
**Project commit anchor:** `9226f7a` (specs committed).

## Execution order

Phases 1, 2, 5, and the backend PR can run in parallel-ish. Phase 3 (SDK upgrade) and Phase 4 (auth) have hard dependencies.

```
┌──────────────────────────┐
│ Backend: auth-and-hardening │ ──────┐
└──────────────────────────┘        │ (frontend Phase 4 depends on
                                    │  backend PR being merged)
┌─────────────────────┐             │
│ Phase 1: mechanical  │ ─┐         │
│  cleanup             │  │         │
└─────────────────────┘  │         │
                         ├──▶ ┌────────────────┐    ┌────────────────┐
┌─────────────────────┐  │    │ Phase 3:       │    │ Phase 4:       │
│ Phase 2: identity    │ ─┤    │ SDK upgrade    │ ─▶ │ auth feature    │
│  rename              │  │    │ (worktree)     │    │ (against fixed  │
└─────────────────────┘  │    └────────────────┘    │  backend)       │
                         │                          └────────────────┘
                         │
                         └─▶ ┌────────────────┐
                             │ Phase 5:       │
                             │ release & CI   │
                             └────────────────┘
```

## Plans

| # | Plan | Repo | Branch | Est. tasks |
|---|---|---|---|---|
| B | [hfs-backend-auth-and-hardening](2026-04-27-hfs-backend-auth-and-hardening.md) | `UTC2/hfs_backend` | `fix/auth-and-hardening` | ~12 |
| 1 | [hfs-frontend-phase1-mechanical-cleanup](2026-04-27-hfs-frontend-phase1-mechanical-cleanup.md) | `hfs_frontend` | `chore/mechanical-cleanup` | 9 |
| 2 | [hfs-frontend-phase2-identity-rename](2026-04-27-hfs-frontend-phase2-identity-rename.md) | `hfs_frontend` | `chore/identity-rename` | 6 |
| 3 | [hfs-frontend-phase3-sdk-upgrade](2026-04-27-hfs-frontend-phase3-sdk-upgrade.md) | `hfs_frontend` (worktree) | `chore/sdk-upgrade` | 8 |
| 4 | [hfs-frontend-phase4-auth-feature](2026-04-27-hfs-frontend-phase4-auth-feature.md) | `hfs_frontend` | `feat/auth` | ~14 |
| 5 | [hfs-frontend-phase5-release-and-ci](2026-04-27-hfs-frontend-phase5-release-and-ci.md) | `hfs_frontend` | `chore/release-and-ci` | 6 |

## Conventions across plans

- **Commit cadence:** one commit per task (or per logical step within a task).
- **Co-author trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- **PR template:** every PR opens with a link to the spec section it implements. PR title matches the branch name.
- **Verification:** each plan ends with a manual smoke-test checklist.
- **Out-of-scope:** if a task surfaces a bug unrelated to the plan's scope, file a follow-up issue, do not fix in-line.

## Pre-flight (before starting any plan)

1. **Confirm AWS leak escalated.** Daniel has notified the AWS account owner of the credentials in `UTC2/hfs_backend/dev.env`. Until then, the `/upload` endpoint is treated as broken.
2. **Confirm `EXPO_TOKEN` available** for Phase 5. Daniel has run `eas init` and added `EXPO_TOKEN` to repo secrets.
3. **Confirm `UTC2/hfs_backend` push access** for the backend plan. Daniel has owner access; PR target is `dev` (the default branch).
