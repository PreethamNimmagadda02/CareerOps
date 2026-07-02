variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (used in resource names + tags)."
  type        = string
  default     = "prod"
}

variable "name_prefix" {
  description = "Prefix for all resource names."
  type        = string
  default     = "careerops"
}

# ── DNS / TLS ────────────────────────────────────────────────────────────────
variable "domain_name" {
  description = "Public FQDN for the dashboard, e.g. careerops.example.com."
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID that owns domain_name."
  type        = string
}

# ── Networking ───────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to span (>= 2 for Multi-AZ)."
  type        = number
  default     = 2
}

# ── RDS ──────────────────────────────────────────────────────────────────────
variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "Initial RDS storage (GB)."
  type        = number
  default     = 50
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling (GB)."
  type        = number
  default     = 200
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "careerops"
}

variable "db_username" {
  description = "Master DB username."
  type        = string
  default     = "careerops"
}

variable "db_multi_az" {
  description = "Enable RDS Multi-AZ standby."
  type        = bool
  default     = true
}

# ── ECS sizing ───────────────────────────────────────────────────────────────
variable "web_cpu" {
  description = "Fargate CPU units for the web task (1024 = 1 vCPU)."
  type        = number
  default     = 1024
}

variable "web_memory" {
  description = "Fargate memory (MiB) for the web task."
  type        = number
  default     = 2048
}

variable "web_desired_count" {
  description = "Baseline number of web tasks."
  type        = number
  default     = 2
}

variable "web_min_count" {
  type    = number
  default = 2
}

variable "web_max_count" {
  type    = number
  default = 10
}

variable "worker_cpu" {
  description = "Fargate CPU units for the worker task (Chromium is heavy)."
  type        = number
  default     = 2048
}

variable "worker_memory" {
  description = "Fargate memory (MiB) for the worker task."
  type        = number
  default     = 4096
}

variable "worker_min_count" {
  description = "Minimum worker tasks (0 = scale to zero when idle)."
  type        = number
  default     = 0
}

variable "worker_max_count" {
  type    = number
  default = 10
}

# ── Application secrets / config ─────────────────────────────────────────────
# Secret VALUES are passed in via TF_VAR_* env vars (never commit them). They are
# stored in AWS Secrets Manager and injected into tasks at runtime.
variable "auth_secret" {
  description = "Auth.js AUTH_SECRET (openssl rand -base64 33)."
  type        = string
  sensitive   = true
}

variable "auth_google_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "auth_google_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "auth_github_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "auth_github_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "nvidia_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "opencode_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "dynamodb_table_cv" {
  type    = string
  default = "CVs"
}

variable "dynamodb_table_profile" {
  type    = string
  default = "Profiles"
}

# ── Container images ─────────────────────────────────────────────────────────
# Set by CI to the freshly-pushed image tag (git SHA). Defaults let the first
# apply succeed before any image exists (tasks will simply fail to start until
# CI pushes an image and redeploys).
variable "web_image_tag" {
  type    = string
  default = "bootstrap"
}

variable "worker_image_tag" {
  type    = string
  default = "bootstrap"
}

variable "log_retention_days" {
  type    = number
  default = 30
}

# ── CI/CD (GitHub Actions OIDC) ──────────────────────────────────────────────
variable "github_repo" {
  description = "GitHub repo allowed to assume the deploy role, as owner/name."
  type        = string
  default     = "PreethamNimmagadda02/CareerOps"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider. Set false if it already exists in the account."
  type        = bool
  default     = true
}
