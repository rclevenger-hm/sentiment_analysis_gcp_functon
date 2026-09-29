# Contributing

Use Node.js 24 and the committed npm/provider locks. Run `npm ci`, `npm run lint`, `npm test`, `npm audit --audit-level=moderate`, `npm run build`, Terraform format/validate/test before a pull request. Production artifacts and credentials are ignored and must not be committed.

## Changes worth reviewing carefully

Preserve tenant identity, atomic quota reservations, idempotency fingerprints, fenced result pointers and export expiry. Native Google scores must not be relabeled as confidence probabilities. Add behavior tests for boundary or recovery changes; avoid tests that only duplicate implementation. Update OpenAPI and migration documentation when a contract changes.

Deploy only through a protected environment after reviewing the plan. Keep live inference and restoration tests opt-in because they use cloud resources. Include which automated and live checks were actually performed in your pull request.
