# Integration examples

## CLI

```sh
npm run client -- analyze 'Support fixed my issue quickly' --targeted
npm run client -- submit examples/feedback.csv --key survey-2026-001
npm run client -- status JOB_ID
npm run client -- results JOB_ID --sentiment NEGATIVE --maxScore -0.25
npm run client -- report JOB_ID --product Widget
npm run client -- export JOB_ID --format csv --out results.csv
npm run client -- compare CURRENT_JOB_ID BASELINE_JOB_ID
npm run client -- rule examples/alert-rule.json
npm run client -- alerts
npm run client -- acknowledge JOB_ID
```

Use [identity setup](IDENTITY.md) first. Reuse a printed idempotency key when retrying the same submission. Poll with backoff rather than repeatedly consuming the request allowance. Results can be partial until the status is terminal.

