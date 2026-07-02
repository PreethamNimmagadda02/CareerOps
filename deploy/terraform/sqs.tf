# Pipeline job queue (scale-out mode). The web tier produces; the worker fleet
# consumes. A DLQ captures messages that fail repeatedly (e.g. a worker crash
# loop) so they don't silently retry forever.

resource "aws_sqs_queue" "pipeline_dlq" {
  name                      = "${local.name}-pipeline-dlq"
  message_retention_seconds = 1209600 # 14 days
  tags                      = merge(local.tags, { Name = "${local.name}-pipeline-dlq" })
}

resource "aws_sqs_queue" "pipeline" {
  name = "${local.name}-pipeline"

  # Must exceed the longest job runtime so a message isn't redelivered while a
  # worker is still processing it. Keep in sync with PIPELINE_VISIBILITY_SECONDS.
  visibility_timeout_seconds = 900
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 20    # long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.pipeline_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(local.tags, { Name = "${local.name}-pipeline" })
}
