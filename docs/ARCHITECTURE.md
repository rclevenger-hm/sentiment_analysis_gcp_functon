# Architecture

The deployment creates three Node.js Cloud Run functions: API, worker and recovery. They share the source artifact but use separate entry points and service accounts. Cloud Natural Language v1 is required for entity sentiment.

## Data flow

The API verifies a caller, reserves its per-minute allowance, validates input and writes an immutable input object. A Firestore transaction creates the job with its daily allowance reservation; Pub/Sub then receives only tenant and job hashes. A failed publish is safe to retry with the same key and can also be repaired by scheduled recovery.

A worker claims a 240-second lease, analyzes at most 25 rows with four requests in flight and writes a lease-specific result object. One Firestore transaction commits the object pointer, offset, terminal summary and optional alert. Stale workers cannot overwrite an object or commit after losing their lease. A continuation message processes the next checkpoint.

