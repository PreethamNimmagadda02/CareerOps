#!/usr/bin/env bash
# One-time setup of the Terraform remote-state backend: an S3 bucket (versioned,
# encrypted) for state and a DynamoDB table for state locking.
#
# Usage: bootstrap-state.sh <bucket-name> [region] [lock-table]
set -euo pipefail

BUCKET="${1:?state bucket name required}"
REGION="${2:-us-east-1}"
LOCK_TABLE="${3:-careerops-tf-locks}"

echo "→ Creating state bucket s3://$BUCKET in $REGION"
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null || true
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=$REGION" 2>/dev/null || true
fi

aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "→ Creating lock table $LOCK_TABLE"
aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" 2>/dev/null || echo "  (lock table already exists)"

cat <<EOF

Backend ready. Initialize Terraform with:

  cd deploy/terraform
  terraform init \\
    -backend-config="bucket=$BUCKET" \\
    -backend-config="region=$REGION" \\
    -backend-config="dynamodb_table=$LOCK_TABLE"
EOF
