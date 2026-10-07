# Operations

## Health and incidents

Cloud Monitoring alerts on repeated function 5xx responses and messages in the dead-letter subscription. The configured email channel also receives budget notifications. Application logs contain request IDs, safe error categories and job progress, without submitted text or tokens. Google platform logs have their own project retention and access policies.

For 401/403, check canonical audience, both authorization headers, verified service-account email, invoker binding and application allowlist. For 429, inspect `/usage` and `Retry-After`. For 5xx, check Google API availability, enabled services, runtime IAM, database indexes and queue delivery before resubmitting.

## Stuck jobs and dead letters

Read the job's status and last update first. Recovery scans jobs idle for 15 minutes every five minutes and republishes after any lease expires. Firestore and Storage writes are retry-safe but inference may be billed again. Do not delete metadata or lower leases during an incident: a live worker could still own the job.

Inspect dead-letter messages and the associated job before replay. Pub/Sub dead-letter forwarding wraps the original message; extract its original JSON `{tenantId,jobId}` and publish that payload to the jobs topic using an operator identity. A terminal job will be ignored. To retry a `FAILED` job, submit the original data with a fresh idempotency key after fixing the cause. Recovery can already have repaired a job whose earlier delivery is in the dead-letter topic; duplicate replay is unnecessary.

## Retention and restoration

API reads deny expired jobs immediately. Firestore TTL removal and Storage lifecycle deletion are asynchronous. Data objects age from creation, so later result/export objects may outlive the original job by that interval. Feedback-bucket soft delete is disabled to avoid extending deletion beyond the intended lifecycle; database point-in-time recovery retains recoverable history independently. Consult organizational retention requirements before deployment.

Rules expire after the configured retention period and need renewal. Source artifact versions and remote-state versions are retained separately and need an operator cleanup policy. Restore Firestore through its supported recovery procedure, then verify job metadata and referenced Storage objects agree before resuming processing. PITR does not restore deleted feedback objects. Perform a restoration drill before relying on it.
