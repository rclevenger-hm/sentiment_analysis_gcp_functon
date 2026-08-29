# Architecture

The deployment creates three Node.js Cloud Run functions: API, worker and recovery. They share the source artifact but use separate entry points and service accounts. Cloud Natural Language v1 is required for entity sentiment.

## Data flow

The API verifies a caller, reserves its per-minute allowance, validates input and writes an immutable input object. A Firestore transaction creates the job with its daily allowance reservation; Pub/Sub then receives only tenant and job hashes. A failed publish is safe to retry with the same key and can also be repaired by scheduled recovery.

A worker claims a 240-second lease, analyzes at most 25 rows with four requests in flight and writes a lease-specific result object. One Firestore transaction commits the object pointer, offset, terminal summary and optional alert. Stale workers cannot overwrite an object or commit after losing their lease. A continuation message processes the next checkpoint.

## Failure boundaries

The HTTP worker timeout is 180 seconds, below its lease duration. SDK inference calls have an eight-second timeout and no internal retries; queue delivery handles retry. The Pub/Sub subscription has backoff and a dead-letter topic. Pub/Sub's delivery-attempt limit is best effort. Application processing separately ends a job after five unsuccessful claims at the same offset.

Every five minutes Cloud Scheduler invokes recovery through IAM. A fenced global recovery lease, persisted cursor, 20-page limit and 90-second loop budget bound scans. Queued or running jobs untouched for 15 minutes with no live lease are republished. A page contains at most 100 matching records; expired documents are filtered out.

## Storage and isolation

Firestore's `items` collection stores job metadata, counters, rules, alerts and recovery state. Composite indexes serve tenant history, status-filtered history and recovery. TTL uses `expiresOn`; application reads also check `expiresAt`. Cloud Storage contains immutable inputs, candidate result parts and exports. Readers follow only pointers committed in job metadata.

Application tenant isolation is enforced by verified identity and query predicates. Runtime `roles/datastore.user` access is project-wide; it is not a Firestore per-tenant IAM boundary. Use a dedicated project and protect runtime service accounts accordingly.
