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

## Client libraries

`examples/node-client.mjs` uses the included Google-authenticated request helper. `examples/python_client.py` uses `google-auth` and `requests` with workload credentials that can mint service-account ID tokens. The JavaScript helper also supports local ADC plus impersonation. Both examples keep credentials out of source and send both platform and application authorization headers.

Export links are HTTPS bearer URLs valid for 60 seconds. Download immediately, store the resulting file according to your retention policy, and do not record the link in public logs. CSV formula neutralization can prefix dangerous cells with an apostrophe; downstream consumers should preserve that protection.
