# Identity and caller setup

## Two checks

Cloud Run IAM restricts invocation to explicit consumer service accounts. The API then verifies the Google JWT signature using Google's JWKS, RS256, issuer, audience, expiry, issued-at, numeric subject and verified email. Its allowlist must include the caller's email. Tenant identity is a hash of canonical issuer plus subject, so email aliases and caller-supplied headers cannot choose another tenant.

The supplied clients send the same token in `Authorization` and `X-Serverless-Authorization`. Cloud Run validates the latter; the former retains the full signature for application verification. Tokens must target the Terraform `token_audience` output, normally the canonical `cloudfunctions.net` endpoint. When calling the `run_endpoint` alias, set `TOKEN_AUDIENCE` to that canonical audience explicitly.

