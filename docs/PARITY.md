# AWS, Azure and GCP parity

AWS baseline: `4c6bd13ea1c52ad016bba56dbf1011d832b76dad` from [sentiment_analysis_lambda](https://github.com/rclevenger-hm/sentiment_analysis_lambda). Azure baseline: `be7fc087beca28e2afb65540c639e2780cb85f15` from [sentiment_analysis_functon](https://github.com/rclevenger-hm/sentiment_analysis_functon). Both were inspected in October 2026. This compares implemented behavior, not equivalent model accuracy or production certification.

## Feature mapping

| Capability | AWS baseline | GCP implementation |
|---|---|---|
| Single sentiment | Comprehend | Cloud Natural Language v1 |
| Bulk input | JSON/CSV, 200 records, 1 MiB | Same limits and partial-row errors |
| Background work | 25-record checkpoints | Same; four Google requests in flight |
| Targeted sentiment | English entity mentions | English, Spanish, Japanese entity mentions |
| Scores | Class confidence values | Native polarity and magnitude, explicit label policy |
| Authentication | IAM identity | IAM invoker plus verified Google issuer/subject and email allowlist |
| Tenant access | DynamoDB partition | Hash-scoped Firestore documents, tenant-filtered queries |
| Quota/idempotency | Conditional writes | Atomic Firestore job and allowance transaction |
| Worker fencing | Conditional checkpoints | Lease token, lease expiry and offset transaction checks |
| Result objects | Shared part names | Lease-specific immutable generation-guarded objects |
| Alerts | Separate write | Atomic final checkpoint and alert creation |
| Recovery | Scheduled scan | Authenticated scheduler, persistent cursor, fenced scan lease |
| Reports/comparison | Trends, concerns, rate deltas | Same domain reports with native score filters |
| Export | Signed S3 download | 60-second Cloud Storage V4 signed download |
| Retention | S3 lifecycle/DynamoDB TTL | Storage lifecycle, Firestore TTL and immediate API expiry |
| Deployment | Terraform and OIDC | Terraform and workload identity federation |
| Monitoring | CloudWatch/SNS/Budget | Cloud Monitoring, email channel, project-filtered budget |

