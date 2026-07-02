# CV + Profile stores. On-demand billing absorbs spikes with zero capacity
# planning. Both tables use composite PK(HASH)+SK(RANGE), matching
# scripts/init-dynamo.ts.

resource "aws_dynamodb_table" "cv" {
  name         = var.dynamodb_table_cv
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

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.tags, { Name = var.dynamodb_table_cv })
}

resource "aws_dynamodb_table" "profile" {
  name         = var.dynamodb_table_profile
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

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.tags, { Name = var.dynamodb_table_profile })
}
