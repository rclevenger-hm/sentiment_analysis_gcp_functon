# Operations

## Health and incidents

Cloud Monitoring alerts on repeated function 5xx responses and messages in the dead-letter subscription. The configured email channel also receives budget notifications. Application logs contain request IDs, safe error categories and job progress, without submitted text or tokens. Google platform logs have their own project retention and access policies.

For 401/403, check canonical audience, both authorization headers, verified service-account email, invoker binding and application allowlist. For 429, inspect `/usage` and `Retry-After`. For 5xx, check Google API availability, enabled services, runtime IAM, database indexes and queue delivery before resubmitting.

