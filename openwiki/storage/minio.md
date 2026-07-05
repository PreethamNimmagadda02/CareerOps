# MinIO Integration: Report Storage

MinIO is an S3-compatible object storage service used to store evaluation reports and resumes.

## Overview

**Role:** Primary storage for evaluation report markdown files and uploaded resumes.

**Why MinIO over Postgres:**
- Reports are large (full A–F evaluation + interview prep)
- Unbounded size (easy to scale with S3)
- Pre-signed URLs for secure sharing
- Cost-effective (S3 cheaper than database storage)

**Connection:** `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`

## Configuration

### Local Development

MinIO is started via `docker-compose.yml`:

```bash
docker compose up minio minio-init
```

This:
1. Starts MinIO server on `localhost:9000`
2. Creates the configured bucket
3. Enables anonymous download (for report URLs)

**Web UI:** http://localhost:9001 (admin / careerops123)

### Environment Variables

```bash
# .env
MINIO_ENDPOINT=http://localhost:9000              # API endpoint
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=careerops123
MINIO_BUCKET=careerops                            # Bucket name
MINIO_PUBLIC_ENDPOINT=http://localhost:9000       # Optional: browser-visible endpoint
```

## Report Upload Flow

### During Evaluation

```
evaluate.ts
  ↓
Evaluate job with LLM
  ↓
parseScore() → extract score
  ↓
writeReport(reportName, markdown)
  ↓
src/lib/minio.ts: uploadReport()
  ↓
MinIO (PUT /careerops/001-company-YYYY-MM-DD.md)
  ↓
Return public URL
  ↓
Postgres Application (update reportUrl)
```

### Code Example

```typescript
import { uploadReport, getReportUrl } from "@/lib/minio";

// Upload report
const markdown = `# Evaluation...\n...`;
const reportName = "001-acme-2024-01-15.md";
await uploadReport({
  reportName,
  markdown,
});

// Get public URL
const url = getReportUrl(reportName);
// → http://localhost:9000/careerops/001-acme-2024-01-15.md
```

## Resume Upload Flow

### User Uploads Resume

```
web/components/profile-view.tsx
  ↓
User selects PDF file
  ↓
POST /api/profile/resume
  ↓
src/lib/minio.ts: uploadResume()
  ↓
MinIO (PUT /careerops/resumes/<userId>.pdf)
  ↓
Postgres User.resumeKey = "resumes/<userId>.pdf"
```

## Naming Conventions

### Reports

```
{###}-{company-slug}-{YYYY-MM-DD}.md
```

**Examples:**
```
001-anthropic-2024-01-15.md
002-google-2024-01-16.md
042-openai-2024-02-20.md
```

### Resumes

```
resumes/{userId}.pdf
```

**Example:**
```
resumes/user-123-abc.pdf
```

## Key Functions

See `src/lib/minio.ts`:

```typescript
// Upload a report
uploadReport(opts: {
  reportName: string;
  markdown: string;
}): Promise<string>;

// Download a report
downloadReport(reportName: string): Promise<string>;

// Get public URL for a report
getReportUrl(reportName: string): string;

// Upload a resume file
uploadResume(opts: {
  userId: string;
  buffer: Buffer;
}): Promise<string>;

// Download a resume file
downloadResume(key: string): Promise<Buffer>;

// Check if object exists
objectExists(key: string): Promise<boolean>;
```

## Permissions

By default, MinIO bucket is configured for **anonymous download**:

```bash
mc anonymous set download minio/careerops
```

This allows report URLs to be accessed from a browser without authentication. To change:

```bash
# Disable anonymous access
mc anonymous set none minio/careerops

# Use presigned URLs instead
const presignedUrl = await generatePresignedUrl(reportName, 3600);  // 1 hour
```

## Troubleshooting

### MinIO Connection Failed

**Error:**
```
ECONNREFUSED 127.0.0.1:9000
```

**Fix:**
```bash
docker compose up -d minio
docker compose ps minio  # Verify running
```

### Bucket Does Not Exist

**Error:**
```
NoSuchBucket: The specified bucket does not exist
```

**Fix:**
```bash
# Initialize bucket
docker compose up minio-init
# or manually
npm run dynamo:init  # Creates bucket as side effect
```

### Report Upload Fails

**Error:**
```
PUT /careerops/... — 403 Forbidden
```

**Diagnosis:**
```bash
# Check MinIO credentials
echo $MINIO_ACCESS_KEY $MINIO_SECRET_KEY

# Test connectivity
curl -X GET http://localhost:9000/minio/webrpc
```

**Fix:**
```bash
# Restart MinIO with correct env
docker compose down
docker compose up -d minio
```

### Report URL Unreachable

**Symptom:** Report URL works from CLI but not from browser.

**Cause:** `MINIO_PUBLIC_ENDPOINT` not set (browser uses different host).

**Fix:**
```bash
# .env
MINIO_PUBLIC_ENDPOINT=http://minio-public.example.com:9000
# or for local dev:
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
```

## Backup & Migration

### Backup All Reports

```bash
mc mirror minio/careerops ./backup-reports/
```

### Restore from Backup

```bash
mc mirror ./backup-reports/ minio/careerops/
```

### Migrate to Different Bucket

```bash
# 1. Create new bucket
mc mb minio/careerops-prod

# 2. Copy all reports
mc mirror minio/careerops/ minio/careerops-prod/

# 3. Update .env
MINIO_BUCKET=careerops-prod

# 4. Update Postgres references (if reportUrl stored)
# See: scripts/migrate-bucket.ts
npm run db:migrate-bucket
```

## See Also

- [Storage Overview](./overview.md) — Storage architecture
- [Operations: MinIO Troubleshooting](../operations/troubleshooting.md)
