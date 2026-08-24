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

## Inputs and limits

Text is nonblank and at most 5,000 UTF-8 bytes. Bodies are at most 1 MiB, batches at most 200 records, and IDs must be unique. JSON uploads contain `records`, optional `label` and optional boolean `targeted`. CSV accepts `id,text,languageCode,date,product,source`; quoted commas, escaped quotes and embedded newlines are supported. CSV targeted analysis uses `?targeted=true`. Invalid rows become individual errors; malformed containers and duplicate IDs reject the submission.

Supported document languages: `ar,de,en,es,fr,it,ja,ko,pt,zh,zh-TW,zh-Hant,nl,id,th,tr,vi`. `zh-TW` maps to Google's `zh-Hant`. Targeted mode accepts only `en,es,ja`. Hindi is rejected because Google does not offer document sentiment for it in the referenced support matrix.

A job key contains 8–128 letters, digits, dots, underscores, colons or hyphens. Reusing a key with the same normalized payload returns the existing job without charging the daily allowance again. Different payloads return 409. Reuse after expiration can return `EXPIRED_KEY` until Firestore TTL removes the record; use a fresh key.

