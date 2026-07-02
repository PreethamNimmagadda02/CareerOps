# CarrerOps — Production Deployment (AWS)

This directory contains everything needed to run CarrerOps in production on AWS
for a large user base: Terraform IaC, production Dockerfiles, a CI/CD workflow,
and operational scripts.

## Architecture

```
Route53 → ALB (HTTPS, ACM) → ECS Fargate WEB service (Next.js dashboard + API)
                                   │ enqueue
                              Amazon SQS (pipeline + DLQ)
                                   │ poll (autoscales on backlog, → 0 when idle)
                              ECS Fargate WORKER service (CLI + headless Chromium)
                                   │
   RDS Postgres (Multi-AZ) · DynamoDB (CVs, Profiles) · S3 + CloudFront (reports)
   Secrets Manager · external LLM APIs (NVIDIA / Zen)
```

Why two services? The pipeline launches up to 12 concurrent Chromium instances
per run and can take minutes. Running that inside the web container starves the
dashboard under load. Splitting them lets the web tier stay small and the worker
tier scale on queue depth (and to zero when idle). Toggle with `PIPELINE_MODE`
(`sqs` in prod, `inline` for the legacy single-container model).

## What changed in the app code

| Change | Why |
|---|---|
| `src/lib/s3-client.ts` + env-driven S3 in `minio.ts`/`storage.ts`/`reports.ts` | Same code targets MinIO (dev) and real S3 (prod) via IAM role; no hardcoded region/path-style |
| `REPORTS_PUBLIC_BASE_URL` in `reportObjectUrl` | Correct public URLs via CloudFront (bucket-root), MinIO unchanged |
| `web/app/api/health` + `/api/ready` | ALB liveness / readiness probes |
| `prisma/migrations/0_init` + lock | Real migrations (`migrate deploy`) instead of `db push`; adds `pgcrypto` |
| `PipelineRun` model, `src/lib/sqs.ts`, `src/worker/` | SQS producer/consumer; web tails logs from the DB so the browser UX is unchanged |
| `output: "standalone"`, pinned Playwright `1.59.1` | Slimmer builds, no image/lib version drift |

Default behaviour is unchanged: with `PIPELINE_MODE` unset the app spawns the
pipeline inline exactly as before.

## Prerequisites

- An AWS account + `aws` CLI v2 configured (`aws sts get-caller-identity` works)
- `terraform >= 1.6`, `docker`, `jq`
- A Route53 **hosted zone** for your domain
- OAuth apps (Google and/or GitHub) with callback `https://<domain>/api/auth/callback/<provider>`
- LLM API key (`NVIDIA_API_KEY` and/or `OPENCODE_API_KEY`)

## First-time deploy

```bash
# 1. Remote state backend (once per account)
deploy/scripts/bootstrap-state.sh careerops-tfstate-<account-id> us-east-1

# 2. Configure
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars      # set domain_name, route53_zone_id, github_repo
export TF_VAR_auth_secret="$(openssl rand -base64 33)"
export TF_VAR_nvidia_api_key="nvapi-..."
export TF_VAR_auth_google_id="..."  TF_VAR_auth_google_secret="..."
# (add github / opencode vars as needed)

terraform init \
  -backend-config="bucket=careerops-tfstate-<account-id>" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=careerops-tf-locks"

# 3. Provision infra (RDS, DynamoDB, S3/CloudFront, ECR, SQS, ECS, ALB, …)
terraform apply
# Tasks won't be healthy yet — no image exists. That's expected.

# 4. Build, push, migrate, deploy (from repo root)
cd ../..
deploy/scripts/deploy.sh

# 5. Seed the CV + Profile stores (run locally with AWS creds; endpoint UNSET)
unset DYNAMODB_ENDPOINT
DYNAMODB_REGION=us-east-1 npm run dynamo:init
```

Then open `https://<domain>`.

## Ongoing deploys (CI/CD)

Push to `main` triggers `.github/workflows/deploy.yml`, which builds both images,
runs `prisma migrate deploy` as a one-off ECS task, and rolls the services with
deployment circuit-breaker auto-rollback.

Set these GitHub **Actions variables** (from `terraform output`):

| Variable | Source |
|---|---|
| `AWS_REGION` | your region |
| `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` |
| `ECR_WEB_REPO` / `ECR_WORKER_REPO` | repo names (`careerops-prod-web` / `-worker`) |
| `ECS_CLUSTER` | `ecs_cluster_name` |
| `ECS_WEB_SERVICE` / `ECS_WORKER_SERVICE` | `ecs_web_service` / `ecs_worker_service` |
| `ECS_MIGRATE_TASKDEF` | `migrate_task_definition` |
| `ECS_SUBNETS` | `private_subnet_ids` (comma-joined) |
| `ECS_WORKER_SG` | `worker_security_group_id` |

## Scaling & cost levers

- **Web**: autoscales 2→N on CPU 60% and ALB request count.
- **Worker**: autoscales `worker_min_count`→`worker_max_count` on SQS backlog;
  set `worker_min_count = 0` to scale to zero when idle.
- **LLM spend** is the main variable cost — add per-user quotas before opening to
  a large crowd.
- Gateway VPC endpoints (S3/DynamoDB) keep that traffic off the NAT gateway.

## Security notes

- No static cloud credentials: tasks use IAM roles; CI uses GitHub OIDC.
- Secrets live in Secrets Manager, injected at task start.
- RDS: encrypted, Multi-AZ, private, `sslmode=require`, deletion protection on.
- Reports bucket is private; served only via CloudFront (OAC). Report keys are
  namespaced per user but **not** signed — for stricter isolation switch
  `reportUrl` to pre-signed URLs (the in-app `/api/reports/[num]` already does an
  ownership check and reads from S3 directly).
- Add a WAF to the ALB/CloudFront and an SNS target for the CloudWatch alarms in
  `monitoring.tf` before launch.

## Teardown

```bash
cd deploy/terraform
terraform destroy   # RDS has deletion_protection + a final snapshot; disable/skip as needed
```
