# Validation and release limits

## Automated checks

`npm test` exercises input parsing, Unicode, labels and native scores, targeted offsets, Google JWT verification, raw HTTP boundaries, tenant isolation, quota/idempotency races, state transitions, stale worker fencing, immutable objects, atomic alert/checkpoint rollback, pagination, recovery, reports, exports and dependency compatibility.

Firestore tests use a stateful transaction double with staged atomic writes, read-before-write enforcement and query cursors. They deliberately test failed writes and competing claims. They are not the Firestore emulator and cannot validate every production SDK behavior. Analyzer tests stub Google RPCs, so they do not measure model quality.

CI builds the deployment artifact, installs production-only dependencies, loads all function registrations, audits dependencies, validates Terraform and runs three mocked Terraform plans. Those plans check secure defaults and reject invalid quotas/public consumer principals. They do not create cloud resources.

## Live acceptance

After deployment, run the billable smoke test with a consumer identity. Verify rejection without credentials and with a wrong audience, read a single result, complete a mixed-validity bulk job, repeat its idempotency key, read the report and download an export. Confirm anonymous requests get 401/403 and the second consumer cannot read the first consumer's job.

Exercise a transient Natural Language error and failed publish; verify recovery eventually completes the job without duplicate committed results. Inspect Pub/Sub authenticated push and dead-letter permissions. Confirm Firestore indexes are ready, V4 URLs expire and no text/tokens appear in logs. Perform a restoration drill and confirm budget/operational notification delivery. Run these checks in a disposable nonproduction project before production rollout.

## Model acceptance

Use a labeled evaluation set spanning supported languages and your feedback domain. Measure native score calibration and label precision/recall, including neutral versus mixed documents and entity extraction. Pin client expectations to `labelPolicy`; changes to thresholds or model fields need an explicit compatibility review. No predictive-quality advantage over AWS/Azure is claimed from unit tests.
