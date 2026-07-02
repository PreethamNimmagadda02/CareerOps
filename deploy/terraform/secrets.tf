# Application secrets live in AWS Secrets Manager and are injected into ECS
# tasks at runtime (never baked into images or task-definition env). Values come
# from TF_VAR_* (sensitive) or are derived (DATABASE_URL).

locals {
  secret_values = {
    AUTH_SECRET        = var.auth_secret
    DATABASE_URL       = local.database_url
    NVIDIA_API_KEY     = var.nvidia_api_key
    OPENCODE_API_KEY   = var.opencode_api_key
    AUTH_GOOGLE_ID     = var.auth_google_id
    AUTH_GOOGLE_SECRET = var.auth_google_secret
    AUTH_GITHUB_ID     = var.auth_github_id
    AUTH_GITHUB_SECRET = var.auth_github_secret
  }

  # Only inject secrets that have a non-empty value (ECS fails on empty/missing).
  active_secrets = { for k, v in local.secret_values : k => v if v != "" }
}

resource "aws_secretsmanager_secret" "app" {
  for_each = local.active_secrets
  name     = "${local.name}/${each.key}"
  tags     = merge(local.tags, { Name = "${local.name}/${each.key}" })
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = local.active_secrets
  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = each.value
}
