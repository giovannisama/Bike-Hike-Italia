# Sentry Setup (Expo/EAS)

## DSN Configuration
- Do not commit DSN in the repo.
- Set `EXPO_PUBLIC_SENTRY_DSN` via EAS secrets or CI env:
  - `eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value <dsn>`
- Optional: set `EXPO_PUBLIC_SENTRY_ENV` to `staging` or `production`.

## Notes
- Sentry is enabled only in non-DEV builds when DSN is present.
- `tracesSampleRate` is 0 (no performance tracing).
- No PII is sent (`sendDefaultPii: false`).
