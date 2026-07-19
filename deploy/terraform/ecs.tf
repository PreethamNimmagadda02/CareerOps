# ── ECR Repository ───────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "app" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = var.app_name }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ── IAM Roles ────────────────────────────────────────────────────────────────────
# ECS Task Execution Role — allows ECS to pull images + write logs
resource "aws_iam_role" "ecs_execution" {
  name = "${var.app_name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "read-secrets"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.app.arn
    }]
  })
}

# ECS Task Role — runtime permissions for app code (S3, DynamoDB)
resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3-reports"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketLocation"]
      Resource = [aws_s3_bucket.reports.arn, "${aws_s3_bucket.reports.arn}/*"]
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_dynamodb" {
  name = "dynamodb-tables"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:DescribeTable", "dynamodb:CreateTable"]
      Resource = [aws_dynamodb_table.cvs.arn, aws_dynamodb_table.profiles.arn]
    }]
  })
}

# ── ECS Cluster ──────────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = var.app_name

  setting {
    name  = "containerInsights"
    value = "disabled" # enable for extra visibility at extra cost
  }
}

# ── Shared environment variables injected into all task definitions ──────────────
locals {
  db_url    = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.address}:5432/${var.db_name}?schema=public"
  redis_url = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"

  common_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "AWS_REGION", value = var.aws_region },
    # DynamoDB — no endpoint means real AWS (SDK default)
    { name = "DYNAMODB_REGION", value = var.aws_region },
    { name = "DYNAMODB_TABLE_CV", value = aws_dynamodb_table.cvs.name },
    { name = "DYNAMODB_TABLE_PROFILE", value = aws_dynamodb_table.profiles.name },
    # S3 replaces MinIO — no endpoint means real AWS S3
    { name = "MINIO_BUCKET", value = aws_s3_bucket.reports.bucket },
  ]

  # Secrets injected at container start from Secrets Manager
  secret_arn = aws_secretsmanager_secret.app.arn
  common_secrets = [
    { name = "DATABASE_URL", valueFrom = "${local.secret_arn}:DATABASE_URL::" },
    { name = "REDIS_URL", valueFrom = "${local.secret_arn}:REDIS_URL::" },
    { name = "AUTH_SECRET", valueFrom = "${local.secret_arn}:AUTH_SECRET::" },
    { name = "AUTH_GOOGLE_ID", valueFrom = "${local.secret_arn}:AUTH_GOOGLE_ID::" },
    { name = "AUTH_GOOGLE_SECRET", valueFrom = "${local.secret_arn}:AUTH_GOOGLE_SECRET::" },
    { name = "AUTH_GITHUB_ID", valueFrom = "${local.secret_arn}:AUTH_GITHUB_ID::" },
    { name = "AUTH_GITHUB_SECRET", valueFrom = "${local.secret_arn}:AUTH_GITHUB_SECRET::" },
    { name = "NVIDIA_API_KEY", valueFrom = "${local.secret_arn}:NVIDIA_API_KEY::" },
    { name = "OPENCODE_API_KEY", valueFrom = "${local.secret_arn}:OPENCODE_API_KEY::" },
    { name = "CAREER_OPS_USER_EMAIL", valueFrom = "${local.secret_arn}:CAREER_OPS_USER_EMAIL::" },
  ]

  log_config = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.app.name
      awslogs-region        = var.aws_region
      awslogs-stream-prefix = "ecs"
    }
  }
}

# ── Web App Task ─────────────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.app_name}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.app_cpu
  memory                   = var.app_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "app"
    image     = "${aws_ecr_repository.app.repository_url}:latest"
    essential = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment  = concat(local.common_env, [
      { name = "AUTH_URL", value = "http://${aws_lb.main.dns_name}" },
      { name = "AUTH_TRUST_HOST", value = "true" },
      { name = "DATABASE_POOL_MAX", value = "5" },
    ])
    secrets   = local.common_secrets
    logConfiguration = local.log_config
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "${var.app_name}-app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public_a.id, aws_subnet.public_b.id]
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]

  lifecycle {
    ignore_changes = [task_definition] # CI/CD handles updates
  }
}

# ── Worker Task ──────────────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.app_name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${aws_ecr_repository.app.repository_url}:latest"
    essential = true
    command   = ["run", "worker:prod"]
    environment = concat(local.common_env, [
      { name = "WORKER_CONCURRENCY", value = "2" },
    ])
    secrets          = local.common_secrets
    logConfiguration = local.log_config
  }])
}

resource "aws_ecs_service" "worker" {
  name            = "${var.app_name}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public_a.id]
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

# ── Migrate Task (one-shot, run via ECS RunTask in CI) ───────────────────────────
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.app_name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = "${aws_ecr_repository.app.repository_url}:latest"
    essential = true
    command   = ["run", "db:migrate:deploy"]
    environment  = local.common_env
    secrets      = local.common_secrets
    logConfiguration = local.log_config
  }])
}

# ── Dynamo-Init Task (one-shot, run via ECS RunTask in CI) ───────────────────────
resource "aws_ecs_task_definition" "dynamo_init" {
  family                   = "${var.app_name}-dynamo-init"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "dynamo-init"
    image     = "${aws_ecr_repository.app.repository_url}:latest"
    essential = true
    # Uses the init target CMD
    command   = ["run", "dynamo:init"]
    environment  = local.common_env
    secrets      = local.common_secrets
    logConfiguration = local.log_config
  }])
}
