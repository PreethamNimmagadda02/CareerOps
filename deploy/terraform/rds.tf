resource "random_password" "db" {
  length  = 32
  special = false # avoid URL-encoding headaches in DATABASE_URL
}

resource "aws_db_instance" "postgres" {
  identifier     = "${local.name}-pg"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  multi_az               = var.db_multi_az
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  backup_retention_period = 14
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${local.name}-pg-final"
  apply_immediately       = false

  performance_insights_enabled = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = merge(local.tags, { Name = "${local.name}-pg" })
}

# Full connection string consumed by Prisma. require SSL in transit.
locals {
  database_url = format(
    "postgresql://%s:%s@%s:%d/%s?schema=public&sslmode=require",
    var.db_username,
    random_password.db.result,
    aws_db_instance.postgres.address,
    5432,
    var.db_name,
  )
}
