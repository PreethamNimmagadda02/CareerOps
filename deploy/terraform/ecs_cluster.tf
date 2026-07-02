resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.tags
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

locals {
  # Non-secret environment shared by web + worker tasks.
  common_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "AWS_REGION", value = var.region },
    { name = "S3_REGION", value = var.region },
    { name = "S3_FORCE_PATH_STYLE", value = "false" },
    { name = "DYNAMODB_REGION", value = var.region },
    { name = "DYNAMODB_TABLE_CV", value = var.dynamodb_table_cv },
    { name = "DYNAMODB_TABLE_PROFILE", value = var.dynamodb_table_profile },
    { name = "MINIO_BUCKET", value = aws_s3_bucket.reports.id },
    { name = "REPORTS_PUBLIC_BASE_URL", value = "https://${aws_cloudfront_distribution.reports.domain_name}" },
    { name = "PIPELINE_MODE", value = "sqs" },
    { name = "PIPELINE_QUEUE_URL", value = aws_sqs_queue.pipeline.url },
    { name = "PIPELINE_VISIBILITY_SECONDS", value = "900" },
  ]

  # Secrets are referenced by ARN; ECS resolves them at task start.
  secret_refs = [for k, s in aws_secretsmanager_secret.app : {
    name      = k
    valueFrom = s.arn
  }]
}
