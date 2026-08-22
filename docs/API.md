# API contract

All routes require a Google service-account ID token, platform invoker access and an application allowlist entry. Tenant identity comes from the verified issuer and subject, never request fields. Examples assume the canonical function endpoint with no trailing slash. See [OpenAPI](../openapi.yaml) for schemas.

