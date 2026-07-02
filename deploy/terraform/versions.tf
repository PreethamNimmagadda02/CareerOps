terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state. Bootstrap the bucket + lock table once with
  # deploy/scripts/bootstrap-state.sh, then `terraform init` with -backend-config.
  backend "s3" {
    key     = "careerops/terraform.tfstate"
    encrypt = true
    # bucket / region / dynamodb_table supplied via -backend-config (see README).
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "CareerOps"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
