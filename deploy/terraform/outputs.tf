output "app_url" {
  description = "Public dashboard URL."
  value       = "https://${var.domain_name}"
}

output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "ecr_web_repository_url" {
  value = aws_ecr_repository.web.repository_url
}

output "ecr_worker_repository_url" {
  value = aws_ecr_repository.worker.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_web_service" {
  value = aws_ecs_service.web.name
}

output "ecs_worker_service" {
  value = aws_ecs_service.worker.name
}

output "migrate_task_definition" {
  value = aws_ecs_task_definition.migrate.family
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}

output "reports_bucket" {
  value = aws_s3_bucket.reports.id
}

output "reports_cloudfront_domain" {
  value = aws_cloudfront_distribution.reports.domain_name
}

output "pipeline_queue_url" {
  value = aws_sqs_queue.pipeline.url
}

output "private_subnet_ids" {
  value = module.vpc.private_subnets
}

output "worker_security_group_id" {
  value = aws_security_group.worker.id
}

output "database_url_secret_arn" {
  description = "Secrets Manager ARN holding DATABASE_URL."
  value       = try(aws_secretsmanager_secret.app["DATABASE_URL"].arn, null)
}
