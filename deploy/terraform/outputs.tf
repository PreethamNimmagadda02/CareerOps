output "alb_dns_name" {
  description = "Public URL of the Application Load Balancer (your app URL)"
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL — used in docker push commands"
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (internal, not publicly accessible)"
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint (internal)"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
  sensitive   = true
}

output "s3_bucket_name" {
  description = "S3 bucket name for reports (replaces MinIO)"
  value       = aws_s3_bucket.reports.bucket
}

output "secrets_manager_arn" {
  description = "ARN of the Secrets Manager secret containing all app environment variables"
  value       = aws_secretsmanager_secret.app.arn
}

output "migrate_task_definition" {
  description = "ECS task definition ARN for running Prisma migrations"
  value       = aws_ecs_task_definition.migrate.arn
}

output "dynamo_init_task_definition" {
  description = "ECS task definition ARN for initialising DynamoDB tables"
  value       = aws_ecs_task_definition.dynamo_init.arn
}

output "update_oauth_redirect_uris" {
  description = "Add these callback URLs to your Google/GitHub OAuth apps"
  value = {
    google = "http://${aws_lb.main.dns_name}/api/auth/callback/google"
    github = "http://${aws_lb.main.dns_name}/api/auth/callback/github"
  }
}
