#!/usr/bin/env bash
# Manual end-to-end deploy (mirror of the GitHub Actions workflow): build + push
# both images, run DB migrations, roll the services. Reads infrastructure
# coordinates from `terraform output`.
#
# Run from repo root after `terraform apply`. Requires: docker, aws, jq, terraform.
#
# Usage: deploy/scripts/deploy.sh [tag]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TF_DIR="$ROOT/deploy/terraform"
TAG="${1:-$(git -C "$ROOT" rev-parse --short=12 HEAD)}"

out() { terraform -chdir="$TF_DIR" output -raw "$1"; }

REGION=$(terraform -chdir="$TF_DIR" output -raw rds_endpoint >/dev/null 2>&1; aws configure get region || echo us-east-1)
WEB_REPO=$(out ecr_web_repository_url)
WORKER_REPO=$(out ecr_worker_repository_url)
CLUSTER=$(out ecs_cluster_name)
WEB_SERVICE=$(out ecs_web_service)
WORKER_SERVICE=$(out ecs_worker_service)
MIGRATE_TASKDEF=$(out migrate_task_definition)
SUBNETS=$(terraform -chdir="$TF_DIR" output -json private_subnet_ids | jq -r 'join(",")')
WORKER_SG=$(out worker_security_group_id)
REGISTRY="${WEB_REPO%/*}"

echo "→ Region:   $REGION"
echo "→ Tag:      $TAG"
echo "→ Cluster:  $CLUSTER"

echo "→ ECR login"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "→ Build & push web"
docker build -f "$ROOT/deploy/docker/Dockerfile.web" -t "$WEB_REPO:$TAG" "$ROOT"
docker push "$WEB_REPO:$TAG"

echo "→ Build & push worker"
docker build -f "$ROOT/deploy/docker/Dockerfile.worker" -t "$WORKER_REPO:$TAG" "$ROOT"
docker push "$WORKER_REPO:$TAG"

echo "→ Run migrations"
TASK_ARN=$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$MIGRATE_TASKDEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$WORKER_SG],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"
CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)
echo "  migrate exit code: $CODE"
[ "$CODE" = "0" ] || { echo "Migration failed"; exit 1; }

echo "→ Roll services"
"$ROOT/deploy/scripts/update-service.sh" "$CLUSTER" "$WEB_SERVICE" "$WEB_REPO:$TAG"
"$ROOT/deploy/scripts/update-service.sh" "$CLUSTER" "$WORKER_SERVICE" "$WORKER_REPO:$TAG"

echo "→ Wait for stability"
aws ecs wait services-stable --cluster "$CLUSTER" --services "$WEB_SERVICE" "$WORKER_SERVICE"
echo "Done. App: $(out app_url)"
