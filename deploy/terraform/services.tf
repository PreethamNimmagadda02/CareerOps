# ── RDS PostgreSQL ───────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${var.app_name}-db-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  tags       = { Name = "${var.app_name}-db-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier             = "${var.app_name}-postgres"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  max_allocated_storage  = 50
  storage_type           = "gp2"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  # Minimal cost: no multi-AZ, no automated backups beyond 1 day
  multi_az               = false
  backup_retention_period = 1
  skip_final_snapshot    = true
  deletion_protection    = false

  tags = { Name = "${var.app_name}-postgres" }
}

# ── Redis (not provisioned) ──────────────────────────────────────────────────────
# The app treats REDIS_URL as optional: without it, rate limits and the
# job-title cache live in process memory and the worker finds new jobs by
# polling. That is only correct while a single web task runs — bring back an
# ElastiCache cluster (and REDIS_URL) before scaling the web service past one.

# ── S3 bucket (replaces MinIO) ──────────────────────────────────────────────────
resource "aws_s3_bucket" "reports" {
  bucket        = "${var.app_name}-reports-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = { Name = "${var.app_name}-reports" }
}

resource "aws_s3_bucket_versioning" "reports" {
  bucket = aws_s3_bucket.reports.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket                  = aws_s3_bucket.reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── DynamoDB Tables ──────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "cvs" {
  name         = "CVs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  tags = { Name = "${var.app_name}-cvs" }
}

resource "aws_dynamodb_table" "profiles" {
  name         = "Profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  tags = { Name = "${var.app_name}-profiles" }
}

# ── Secrets Manager ──────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.app_name}/prod/env"
  recovery_window_in_days = 0 # immediate deletion (dev-friendly; increase for prod)
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL         = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.address}:5432/${var.db_name}?schema=public"
    AUTH_SECRET          = var.auth_secret
    AUTH_GOOGLE_ID       = var.auth_google_id
    AUTH_GOOGLE_SECRET   = var.auth_google_secret
    AUTH_GITHUB_ID       = var.auth_github_id
    AUTH_GITHUB_SECRET   = var.auth_github_secret
    NVIDIA_API_KEY       = var.nvidia_api_key
    OPENCODE_API_KEY     = var.opencode_api_key
    MINIO_BUCKET         = aws_s3_bucket.reports.bucket
    CAREER_OPS_USER_EMAIL = var.career_ops_user_email
  })
}
