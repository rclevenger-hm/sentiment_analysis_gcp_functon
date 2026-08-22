# API contract

All routes require a Google service-account ID token, platform invoker access and an application allowlist entry. Tenant identity comes from the verified issuer and subject, never request fields. Examples assume the canonical function endpoint with no trailing slash. See [OpenAPI](../openapi.yaml) for schemas.

## Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/analyze-sentiment` | Analyze `{text, languageCode, targeted?}` |
| POST | `/jobs` | Accept JSON or CSV, with `Idempotency-Key` |
| GET | `/jobs/{id}` | Status, progress, expiry, summary |
| GET | `/jobs/{id}/results` | Filtered records, `offset`, `limit` |
| GET | `/jobs/{id}/report` | Counts, rates, trends, concerns |
| GET | `/jobs/{id}/export` | Finished-job download link, `format=json|csv` |
| GET | `/history` | Caller-owned jobs, cursor pagination |
| GET | `/compare` | Finished `current` and `baseline` job IDs |
| GET | `/usage` | Daily accepted analysis allowance |
| GET/PUT | `/alert-rule` | Read or replace caller's rule |
| GET | `/alerts` | Cursor-paginated alert feed |
| PUT | `/alerts/{jobId}/acknowledge` | Acknowledge an alert |

