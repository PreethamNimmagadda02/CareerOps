#!/usr/bin/env bash
# Register a new task-definition revision for an ECS service with a new image
# and roll the service to it.
#
# Usage: update-service.sh <cluster> <service> <image>
set -euo pipefail

CLUSTER="${1:?cluster required}"
SERVICE="${2:?service required}"
IMAGE="${3:?image required}"

echo "→ Updating $SERVICE on $CLUSTER to $IMAGE"

# Current task definition ARN for the service.
TASKDEF_ARN=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].taskDefinition' --output text)

# Pull the definition, swap the (single) container image, strip read-only fields.
NEW_DEF=$(aws ecs describe-task-definition --task-definition "$TASKDEF_ARN" \
  --query 'taskDefinition' --output json |
  jq --arg IMAGE "$IMAGE" '
    .containerDefinitions[0].image = $IMAGE
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
          .compatibilities, .registeredAt, .registeredBy)')

NEW_ARN=$(aws ecs register-task-definition --cli-input-json "$NEW_DEF" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

echo "  registered $NEW_ARN"

aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$NEW_ARN" --force-new-deployment >/dev/null

echo "  service update triggered"
