# ── EventBridge Scheduler for scan-scheduler ─────────────────────────────────────
# Maps to the docker-compose comment:
# "In AWS this maps to an EventBridge schedule firing an ECS task"

resource "aws_iam_role" "eventbridge_scheduler" {
  name = "${var.app_name}-eventbridge-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_ecs" {
  name = "run-ecs-task"
  role = aws_iam_role.eventbridge_scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = ["arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task-definition/${var.app_name}-scanner:*"]
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.ecs_execution.arn, aws_iam_role.ecs_task.arn]
      }
    ]
  })
}

# Scanner task definition (equivalent to scan-scheduler compose service)
resource "aws_ecs_task_definition" "scanner" {
  family                   = "${var.app_name}-scanner"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.scan_cpu
  memory                   = var.scan_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "scanner"
    image     = "${aws_ecr_repository.app.repository_url}:latest"
    essential = true
    # Runs the portal scan once and exits (EventBridge fires it on schedule)
    command   = ["run", "scan:portals:prod"]
    environment  = local.common_env
    secrets      = local.common_secrets
    logConfiguration = local.log_config
  }])
}

# Every 6 hours (or whatever scan_interval_seconds is set to)
resource "aws_scheduler_schedule" "scan" {
  name       = "${var.app_name}-scan-portals"
  group_name = "default"

  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 30
  }

  # Cron: every 6 hours
  schedule_expression = "rate(6 hours)"

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.eventbridge_scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.scanner.arn
      launch_type         = "FARGATE"

      network_configuration {
        assign_public_ip = true
        security_groups  = [aws_security_group.worker.id]
        subnets          = [aws_subnet.public_a.id]
      }
    }
  }
}
