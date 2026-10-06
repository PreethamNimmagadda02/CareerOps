# CareerOps — AWS Deployment Guide

## Architecture

```
Internet → API Gateway (HTTPS) → VPC link → ECS Fargate (Next.js app)
                                                 ↓
                                          RDS PostgreSQL 16
                                          S3 bucket (reports)
                                          DynamoDB (CV + Profiles)

ECS Fargate Spot (worker) ← background jobs; started when a job is queued,
                            stops itself after 10 idle minutes
EventBridge (every 6h)   → ECS Fargate (scan-portals, one-shot)
```

There is no load balancer and no Redis. API Gateway's HTTP API has no hourly
charge and provides HTTPS; it caps requests at 30 seconds and 10 MB. The app
runs without Redis as long as there is a single web task.

**Estimated monthly cost (minimal, Sydney):** ~$45/month
| Service | Size | ~Cost |
|---|---|---|
| RDS PostgreSQL | db.t3.micro, 20 GB | ~$23 |
| ECS Fargate (app) | 0.25 vCPU, 0.5 GB | ~$11 |
| Public IPv4 address (app task) | 1 | ~$4 |
| ECS Fargate Spot (worker, scans) | 1 vCPU, 2 GB, on demand | ~$3 |
| API Gateway, S3, DynamoDB, Secrets, ECR | on-demand | ~$2 |
| CloudWatch Logs | 14-day retention | ~$1 |

---

## Prerequisites

Install the following on your machine:

```bash
brew install awscli terraform
```

Configure AWS CLI with your credentials:

```bash
aws configure
# AWS Access Key ID: <your key>
# AWS Secret Access Key: <your secret>
# Default region: ap-southeast-2
# Default output format: json
```

Verify:

```bash
aws sts get-caller-identity
```

---

## Phase 1 — First-time Terraform Setup

### 1. Create your `terraform.tfvars`

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` — the region (`ap-southeast-2`) and account details are already pre-filled. You only need to set your secrets:

### 2. Initialize Terraform

```bash
cd deploy/terraform
terraform init
```

### 3. Preview what will be created

```bash
terraform plan
```

Review the output. You should see ~30 resources being created.

### 4. Apply (creates all AWS infrastructure)

```bash
terraform apply
```

Type `yes` when prompted. This takes ~10–15 minutes (RDS takes the longest).

When complete, note the outputs — especially `app_url` and `ecr_repository_url`.

---

## Phase 2 — Build & Push Docker Image

### 1. Log in to ECR

```bash
# Log in to ECR (region pre-filled from your account)
aws ecr get-login-password --region ap-southeast-2 | \
  docker login --username AWS --password-stdin \
  $(terraform output -raw ecr_repository_url | cut -d/ -f1)
```

### 2. Build the image

```bash
cd ../..   # back to project root
docker build --target runtime -t careerops:latest .
```

### 3. Tag and push

```bash
ECR_URL=$(cd deploy/terraform && terraform output -raw ecr_repository_url)
docker tag careerops:latest $ECR_URL:latest
docker push $ECR_URL:latest
```

---

## Phase 3 — First-time Database Initialization

Run the Prisma migration task (one-shot):

```bash
# Get values from terraform output
CLUSTER=$(cd deploy/terraform && terraform output -raw ecs_cluster_name)
SUBNET=$(cd deploy/terraform && terraform output -json | jq -r '.migrate_task_definition.value' | head -1)

# Easier: read from AWS directly
SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=tag:Name,Values=careerops-public-a" \
  --query "Subnets[0].SubnetId" --output text)

WORKER_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=careerops-worker-sg" \
  --query "SecurityGroups[0].GroupId" --output text)

# Run migration
aws ecs run-task \
  --cluster careerops \
  --task-definition careerops-migrate \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$WORKER_SG],assignPublicIp=ENABLED}"
```

Wait for it to complete, then run DynamoDB init:

```bash
aws ecs run-task \
  --cluster careerops \
  --task-definition careerops-dynamo-init \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$WORKER_SG],assignPublicIp=ENABLED}"
```

---

## Phase 4 — Force Deploy ECS Services

```bash
aws ecs update-service --cluster careerops --service careerops-app    --force-new-deployment
aws ecs update-service --cluster careerops --service careerops-worker --force-new-deployment
```

Wait for the app service to stabilize (~2–3 minutes):

```bash
aws ecs wait services-stable --cluster careerops --services careerops-app
```

---

## Phase 5 — Access Your App

```bash
cd deploy/terraform && terraform output app_url
```

Open the URL in your browser. You should see the CareerOps login page.

---

## Phase 6 — Update OAuth Apps

Go to your OAuth provider dashboards and add the callback URLs:

```
# From terraform output update_oauth_redirect_uris
Google:  <APP_URL>/api/auth/callback/google
GitHub:  <APP_URL>/api/auth/callback/github
```

---

## Setting Up CI/CD (GitHub Actions)

### 1. Add GitHub repository secrets

Go to **GitHub → Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |
| `ECS_SUBNET_ID` | Output of: `aws ec2 describe-subnets --region ap-southeast-2 --filters "Name=tag:Name,Values=careerops-public-a" --query "Subnets[0].SubnetId" --output text` |
| `ECS_WORKER_SG_ID` | Output of: `aws ec2 describe-security-groups --region ap-southeast-2 --filters "Name=group-name,Values=careerops-worker-sg" --query "SecurityGroups[0].GroupId" --output text` |

### 2. Push to main

```bash
git add .
git commit -m "Add AWS deployment configuration"
git push origin main
```

GitHub Actions will automatically:
1. Build the Docker image
2. Push to ECR
3. Run Prisma migrations
4. Force-deploy both ECS services

---

## Day-to-Day Operations

### View logs

```bash
# App logs (last 5 minutes)
aws logs tail /ecs/careerops --since 5m --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /ecs/careerops \
  --filter-pattern "ERROR"
```

### Update environment variables / secrets

```bash
# Edit the secret value in Secrets Manager
aws secretsmanager update-secret \
  --secret-id careerops/prod/env \
  --secret-string '{"NVIDIA_API_KEY":"new-key",...}'

# Then force a new deployment so containers pick up the new value
aws ecs update-service --cluster careerops --service careerops-app --force-new-deployment
```

### Scale the worker

```bash
aws ecs update-service --cluster careerops --service careerops-worker --desired-count 2
```

### Tear everything down

```bash
cd deploy/terraform
terraform destroy
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Task keeps restarting | Out of memory | Increase `app_memory` in `terraform.tfvars` + `terraform apply` |
| `DATABASE_URL` connection refused | DB not in same VPC | Check security group rules — ECS must be in same VPC |
| OAuth redirect mismatch | Callback URL wrong | Update provider OAuth app with the exact `app_url` |
| S3 `AccessDenied` | IAM task role missing policy | Re-run `terraform apply` |
| DynamoDB `ResourceNotFoundException` | Tables not created | Run `careerops-dynamo-init` task again |
