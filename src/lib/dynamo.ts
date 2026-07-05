/**
 * DynamoDB client singleton.
 *
 * Uses DynamoDB Local when DYNAMODB_ENDPOINT is set (local dev / Docker),
 * otherwise falls back to real AWS credentials via the standard SDK chain.
 *
 * Env vars:
 *   DYNAMODB_ENDPOINT       — e.g. http://localhost:8000  (omit for real AWS)
 *   DYNAMODB_REGION         — AWS region (default: us-east-1)
 *   DYNAMODB_TABLE_CV       — CV table name (default: CVs)
 *   DYNAMODB_TABLE_PROFILE  — Profile table name (default: Profiles)
 *   AWS_ACCESS_KEY_ID       — AWS access key (or "local" for DynamoDB Local)
 *   AWS_SECRET_ACCESS_KEY   — AWS secret key (or "local" for DynamoDB Local)
 *
 * Each entity type lives in its own table.
 * Both tables use the same key schema: PK (HASH) + SK (RANGE).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_CV = process.env.DYNAMODB_TABLE_CV ?? "CVs";
export const TABLE_PROFILE = process.env.DYNAMODB_TABLE_PROFILE ?? "Profiles";

function createClient(): DynamoDBDocumentClient {
  const endpoint = (process.env.DYNAMODB_ENDPOINT ?? "").replace(/\/$/, "");
  const region = process.env.DYNAMODB_REGION ?? "us-east-1";

  const raw = new DynamoDBClient({
    region,
    ...(endpoint
      ? {
          endpoint,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
          },
        }
      : {}),
  });

  return DynamoDBDocumentClient.from(raw, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertEmptyValues: false,
    },
  });
}

// Singleton — reuse across hot-reloads in tsx/Next.js dev mode.
const g = globalThis as typeof globalThis & { _dynamoClient?: DynamoDBDocumentClient };

export const ddb: DynamoDBDocumentClient = g._dynamoClient ?? (g._dynamoClient = createClient());
