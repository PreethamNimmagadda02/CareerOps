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

# ── ElastiCache Redis ────────────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.app_name}-redis-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.app_name}-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.0"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  tags = { Name = "${var.app_name}-redis" }
}

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
    REDIS_URL            = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
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
