/**
 * SQS integration for the decoupled pipeline (PIPELINE_MODE=sqs).
 *
 * Flow:
 *   web tier   → enqueuePipelineJob()  (producer)
 *   worker tier→ receiveJobs()/deleteJob()  (consumer, src/worker/index.ts)
 *
 * In the default inline mode this module is never touched, so the SQS SDK and
 * a queue URL are only required when you opt into the scale-out architecture.
 *
 * Env:
 *   PIPELINE_MODE        "sqs" to enable the queue; anything else = inline.
 *   PIPELINE_QUEUE_URL   Full SQS queue URL (from Terraform output).
 *   AWS_REGION / S3_REGION / DYNAMODB_REGION  region fallback chain.
 */

import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from "@aws-sdk/client-sqs";

import type { PipelineCommand } from "./pipeline-commands.js";

export interface PipelineJob {
  /** PipelineRun.id — correlates the queue message with its DB row. */
  jobId: string;
  command: PipelineCommand;
  userId: string;
}

function awsRegion(): string {
  return (
    process.env.AWS_REGION ??
    process.env.S3_REGION ??
    process.env.DYNAMODB_REGION ??
    "us-east-1"
  );
}

export function pipelineQueueUrl(): string | undefined {
  return process.env.PIPELINE_QUEUE_URL || undefined;
}

/** Whether the app should route pipeline runs through SQS instead of inline. */
export function sqsEnabled(): boolean {
  return (process.env.PIPELINE_MODE ?? "inline").toLowerCase() === "sqs" && !!pipelineQueueUrl();
}

let cached: SQSClient | null = null;
export function createSqsClient(): SQSClient {
  if (cached) return cached;
  cached = new SQSClient({ region: awsRegion() });
  return cached;
}

/** Producer: push a job onto the pipeline queue. */
export async function enqueuePipelineJob(job: PipelineJob): Promise<void> {
  const QueueUrl = pipelineQueueUrl();
  if (!QueueUrl) throw new Error("PIPELINE_QUEUE_URL is not set (required for PIPELINE_MODE=sqs).");

  await createSqsClient().send(
    new SendMessageCommand({
      QueueUrl,
      MessageBody: JSON.stringify(job),
      // FIFO not required: jobs are independent and idempotent per PipelineRun.
    }),
  );
}

/** Consumer: long-poll for up to one job. */
export async function receiveJobs(opts?: {
  waitSeconds?: number;
  visibilitySeconds?: number;
}): Promise<{ message: Message; job: PipelineJob } | null> {
  const QueueUrl = pipelineQueueUrl();
  if (!QueueUrl) throw new Error("PIPELINE_QUEUE_URL is not set (required for the worker).");

  const res = await createSqsClient().send(
    new ReceiveMessageCommand({
      QueueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: opts?.waitSeconds ?? 20,
      VisibilityTimeout: opts?.visibilitySeconds ?? 900,
    }),
  );

  const message = res.Messages?.[0];
  if (!message?.Body) return null;

  try {
    const job = JSON.parse(message.Body) as PipelineJob;
    return { message, job };
  } catch {
    // Malformed message — delete it so it doesn't poison the queue forever.
    if (message.ReceiptHandle) await deleteJob(message.ReceiptHandle);
    return null;
  }
}

/** Consumer: acknowledge a processed message so it isn't redelivered. */
export async function deleteJob(receiptHandle: string): Promise<void> {
  const QueueUrl = pipelineQueueUrl();
  if (!QueueUrl) return;
  await createSqsClient().send(
    new DeleteMessageCommand({ QueueUrl, ReceiptHandle: receiptHandle }),
  );
}
