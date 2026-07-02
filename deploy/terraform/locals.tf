data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name = "${var.name_prefix}-${var.environment}"

  account_id = data.aws_caller_identity.current.account_id

  # S3 keys are public-read via CloudFront; reports bucket name must be globally
  # unique, so suffix with the account id.
  reports_bucket = "${local.name}-reports-${local.account_id}"

  tags = {
    Project     = "CareerOps"
    Environment = var.environment
  }
}
