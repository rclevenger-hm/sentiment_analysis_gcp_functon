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

## Scores and filters

Results preserve `score` and `magnitude`. `POSITIVE` requires score >= 0.25, `NEGATIVE` <= -0.25, otherwise `NEUTRAL`. A document containing both positive and negative sentences is `MIXED`, regardless of its average score. `labelPolicy` is `sentence-polarity-v1`; this is an application policy, not a Google class-confidence response.

Filters are `sentiment`, `product`, `source`, `from`, `to`, `minScore`, `maxScore`, and `minMagnitude`. Date bounds are inclusive UTC dates. `minConfidence` returns 400 because Google provides no such value. History supports `status`, dates, `limit` (1–100) and `cursor`; result-specific filters apply to results, reports, exports and comparison. Result pagination uses `offset` and `limit` (1–100). Do not mix a cursor with different history filters.

Targeted output contains up to 10 entities, 3 mentions per entity, native sentiment, salience, truncation indicators and excerpts. Offsets are UTF-16 code units into the original input, not Unicode code-point indices. A permanent targeted failure preserves document sentiment and sets `insightsError`.

## Status and failure semantics

Jobs move through `QUEUED`, `RUNNING`, then `COMPLETED`, `COMPLETED_WITH_ERRORS`, or `FAILED`. Reports and result pages can be read while work continues. Comparison and export require terminal jobs. Exhausted jobs retain completed rows and synthesize errors for unprocessed rows.

Application errors include `code`, `error`, `requestId`; 429 includes `Retry-After`. Platform IAM rejections may be HTML and do not use this envelope. Exports expire after 60 seconds and act as bearer links. CSV cells that could execute spreadsheet formulas are neutralized.

Alert rules are a retained feed, not customer email/webhook delivery. Operational notifications are separate. Rules expire with the configured data-retention period and must be renewed.
