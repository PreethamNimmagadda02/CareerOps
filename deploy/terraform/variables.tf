variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "ap-southeast-2"
}

variable "app_name" {
  description = "Application name used to prefix all resources"
  type        = string
  default     = "careerops"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

# ── Database ────────────────────────────────────────────────────────────────────
variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "careerops"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "careerops"
}

variable "db_password" {
  description = "PostgreSQL master password (stored in Secrets Manager)"
  type        = string
  sensitive   = true
}

# ── Auth ────────────────────────────────────────────────────────────────────────
variable "auth_secret" {
  description = "NextAuth secret (run: openssl rand -base64 33)"
  type        = string
  sensitive   = true
}

variable "auth_google_id" {
  description = "Google OAuth Client ID (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "auth_google_secret" {
  description = "Google OAuth Client Secret (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "auth_github_id" {
  description = "GitHub OAuth Client ID (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "auth_github_secret" {
  description = "GitHub OAuth Client Secret (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

# ── LLM providers ───────────────────────────────────────────────────────────────
variable "nvidia_api_key" {
  description = "NVIDIA build.nvidia.com API key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "opencode_api_key" {
  description = "OpenCode Zen API key"
  type        = string
  default     = ""
  sensitive   = true
}

# ── App user ────────────────────────────────────────────────────────────────────
variable "career_ops_user_email" {
  description = "Default pipeline owner email"
  type        = string
  default     = "you@example.com"
}

# ── Compute sizing (keep small for minimal cost) ─────────────────────────────────
variable "app_cpu" {
  description = "CPU units for web app task (256 = 0.25 vCPU)"
  type        = number
  default     = 512
}

variable "app_memory" {
  description = "Memory (MB) for web app task"
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "CPU units for worker task (Playwright needs more headroom)"
  type        = number
  default     = 1024
}

variable "worker_memory" {
  description = "Memory (MB) for worker task"
  type        = number
  default     = 2048
}

variable "scan_cpu" {
  description = "CPU units for scan task"
  type        = number
  default     = 1024
}

variable "scan_memory" {
  description = "Memory (MB) for scan task"
  type        = number
  default     = 2048
}

variable "scan_interval_seconds" {
  description = "Seconds between portal scans (EventBridge rate expression)"
  type        = number
  default     = 21600 # 6 hours
}
