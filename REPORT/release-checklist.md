# Release Checklist

## A) Pre-merge
- CI green (typecheck + guardrails)
- Smoke iOS/Android (see scripts/smoke-checklist.md)
- Permissions non-admin/admin if rules changed

## B) Pre-release
- Version bump / tag if used
- Logs DEV-only (no PII, no tokens)

## C) Deploy
- If rules changed: `firebase deploy --only firestore:rules`
- No `npm audit fix --force`

## D) Post-release
- Verify core flows (home, lists, details, admin if visible)
- Monitor errors (ErrorBoundary in DEV; future crash reporting)
