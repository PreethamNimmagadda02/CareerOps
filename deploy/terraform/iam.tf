# ── ECS task execution role (shared) ─────────────────────────────────────────
# Used by the ECS agent to pull images, fetch secrets and write logs.
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadAppSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [for s in aws_secretsmanager_secret.app : s.arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${local.name}-execution-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# ── Web task role ────────────────────────────────────────────────────────────
resource "aws_iam_role" "web_task" {
  name               = "${local.name}-web-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "web_task" {
  statement {
    sid       = "DynamoRead"
    actions   = ["dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.cv.arn, aws_dynamodb_table.profile.arn]
  }

  statement {
    sid       = "ReportsAndResumesObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]
  }

  statement {
    sid       = "ReportsList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.reports.arn]
  }

  statement {
    sid       = "EnqueuePipeline"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.pipeline.arn]
  }
}

resource "aws_iam_role_policy" "web_task" {
  name   = "${local.name}-web-task"
  role   = aws_iam_role.web_task.id
  policy = data.aws_iam_policy_document.web_task.json
}

# ── Worker task role ─────────────────────────────────────────────────────────
resource "aws_iam_role" "worker_task" {
  name               = "${local.name}-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "worker_task" {
  statement {
    sid = "DynamoReadWrite"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.cv.arn, aws_dynamodb_table.profile.arn]
  }

  statement {
    sid       = "ReportsObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]
  }

  statement {
    sid       = "ReportsList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.reports.arn]
  }

  statement {
    sid = "ConsumePipeline"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.pipeline.arn]
  }
}

resource "aws_iam_role_policy" "worker_task" {
  name   = "${local.name}-worker-task"
  role   = aws_iam_role.worker_task.id
  policy = data.aws_iam_policy_document.worker_task.json
}
