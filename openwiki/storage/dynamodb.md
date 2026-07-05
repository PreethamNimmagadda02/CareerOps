# DynamoDB Integration: CV & Profile Storage

DynamoDB stores candidate CV and profile information. It's optional — local files are fallback.

## Overview

**Role:** Store CV and profile data that's used during evaluation.

**Why DynamoDB over local files:**
- Scalable storage for multiple users
- Easy multi-region replication (DynamoDB Global Tables)
- JSON-like schema, no migrations needed
- Future AWS integration

**Configuration:** `DYNAMODB_ENDPOINT`, `DYNAMODB_REGION`, `DYNAMODB_TABLE_CV`, `DYNAMODB_TABLE_PROFILE`

## Local Development

DynamoDB Local is included in `docker-compose.yml`:

```bash
docker compose up dynamodb dynamo-init
```

This:
1. Starts DynamoDB Local on `localhost:8000`
2. Creates `CVs` and `Profiles` tables
3. Initializes with test data (optional)

## Configuration

### Environment Variables

```bash
# .env

# DynamoDB Local (dev)
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_REGION=us-east-1
DYNAMODB_TABLE_CV=CVs
DYNAMODB_TABLE_PROFILE=Profiles

# AWS credentials for DynamoDB Local (dummy values)
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local

# For production AWS DynamoDB:
# Remove DYNAMODB_ENDPOINT and use real AWS credentials in ~/.aws/credentials
```

## Tables

### CVs Table

Stores candidate CV as plain text (markdown).

**Partition Key:** `userId` (String)

**Attributes:**
- `userId` — Partition key
- `cv` (String) — Full CV markdown
- `uploadedAt` (Number) — Unix timestamp (milliseconds)

**Example Item:**
```json
{
  "userId": "user-123",
  "cv": "# John Doe\n...",
  "uploadedAt": 1705326000000
}
```

### Profiles Table

Stores candidate profile (target roles, compensation, location, skills).

**Partition Key:** `userId` (String)

**Attributes:**
- `userId` — Partition key
- `profile` (String) — YAML or JSON profile data
- `updatedAt` (Number) — Unix timestamp

**Example Item:**
```json
{
  "userId": "user-123",
  "profile": "name: John Doe\ntarget_roles:\n  - Platform Engineer\n...",
  "updatedAt": 1705326000000
}
```

## Usage

### Load CV

```typescript
import { getCV } from "@/lib/cv-store";

const cv = await getCV(userId);
// Returns full CV markdown string
```

**Fallback:** If DynamoDB is unavailable, reads `/cv.md` from local filesystem.

### Update CV

```typescript
import { putCV } from "@/lib/cv-store";

const markdown = "# John Doe\n...";
await putCV(userId, markdown);
```

### Load Profile

```typescript
import { getProfile } from "@/lib/profile-store";

const profile = await getProfile(userId);
// Returns YAML or JSON string
```

**Fallback:** If DynamoDB is unavailable, reads `/config/profile.yml`.

### Update Profile

```typescript
import { putProfile } from "@/lib/profile-store";

const yaml = "name: John Doe\ntarget_roles: [...]";
await putProfile(userId, yaml);
```

## CLI Commands

### Initialize Tables

```bash
npm run dynamo:init
```

Creates `CVs` and `Profiles` tables in DynamoDB Local.

### Upload CV to DynamoDB

```bash
npm run dynamo:cv
```

Reads `/cv.md` and uploads to DynamoDB `CVs` table for the current user (resolved from `CAREER_OPS_USER_EMAIL`).

### Upload Profile to DynamoDB

```bash
npm run dynamo:profile
```

Reads `/config/profile.yml` and uploads to DynamoDB `Profiles` table.

### Get CV from DynamoDB

```bash
npm run dynamo:cv -- --get
```

Downloads CV for current user.

### Get Profile from DynamoDB

```bash
npm run dynamo:profile -- --get
```

Downloads profile for current user.

## Profile Format

### YAML Example

```yaml
name: John Doe
email: john@example.com

target_roles:
  - AI Platform Engineer
  - LLMOps Engineer
  - Senior Software Engineer

target_salary: 200000
target_location: Remote or San Francisco

excluded_roles:
  - QA Engineer
  - Sales Engineer
  - Support Engineer

skills:
  - Python
  - Rust
  - Kubernetes
  - LLMs
  - Distributed Systems

education:
  - BS Computer Science, MIT
  - MS AI, Stanford

experience_years: 7
```

### JSON Example

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "targetRoles": ["AI Platform Engineer", "LLMOps Engineer"],
  "targetSalary": 200000,
  "targetLocation": "Remote or San Francisco",
  "excludedRoles": ["QA Engineer", "Sales Engineer"],
  "skills": ["Python", "Rust", "Kubernetes"],
  "educationYears": 2024
}
```

## Troubleshooting

### DynamoDB Connection Failed

**Error:**
```
Could not connect to the endpoint URL: http://localhost:8000
```

**Fix:**
```bash
docker compose up -d dynamodb
npm run dynamo:init
```

### Table Does Not Exist

**Error:**
```
Cannot find table
```

**Fix:**
```bash
npm run dynamo:init
```

### Upload Fails

**Error:**
```
Unable to locate credentials
```

**Fix:**
```bash
# Ensure .env has dummy credentials for local dev
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
```

### CV Not Found (Uses Fallback)

**Symptom:** Evaluation uses `/cv.md` instead of DynamoDB.

**Cause:** DynamoDB unavailable or CV not uploaded.

**Fix:**
```bash
npm run dynamo:cv  # Upload CV from /cv.md
```

## Backup & Migration

### Export CVs

```bash
aws dynamodb scan \
  --table-name CVs \
  --endpoint-url http://localhost:8000 \
  > cvs-backup.json
```

### Export Profiles

```bash
aws dynamodb scan \
  --table-name Profiles \
  --endpoint-url http://localhost:8000 \
  > profiles-backup.json
```

### Import from Backup

```bash
aws dynamodb batch-write-item \
  --request-items file://cvs-backup.json \
  --endpoint-url http://localhost:8000
```

## See Also

- [Storage Overview](./overview.md) — Storage architecture
- [Operations: DynamoDB Management](../operations/overview.md)
