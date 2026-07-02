# One-off task definition for applying Prisma migrations against RDS. Run it on
# demand (CI or deploy.sh) with `aws ecs run-task`. Uses the worker image, which
# bundles the prisma CLI + prisma/migrations.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.worker_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "migrate"
      image     = "${aws_ecr_repository.worker.repository_url}:${var.worker_image_tag}"
      essential = true
      command   = ["npx", "prisma", "migrate", "deploy"]

      environment = [{ name = "NODE_ENV", value = "production" }]
      secrets     = [for k, s in aws_secretsmanager_secret.app : { name = k, valueFrom = s.arn } if k == "DATABASE_URL"]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.migrate.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "migrate"
        }
      }
    }
  ])

  tags = local.tags
}
