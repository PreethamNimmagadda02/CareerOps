# Operations & Maintenance

This section covers operational tasks: managing the database, debugging issues, monitoring, and keeping the system healthy.

## Quick Reference: Operations Scripts

| Command | Purpose | Typical Use |
|---------|---------|------------|
| `npm run db:backfill` | Update all applications with missing scores | After LLM model change |
| `npm run db:normalize-keywords` | Deduplicate and normalize keywords | Data cleanup |
| `npm run db:migrate-multitenant` | Initialize multi-user schema | First-time setup |
| `npm run db:migrate-bucket` | Migrate reports to different MinIO bucket | Bucket consolidation |
| `npm run db:restore` | Restore applications from backup | After accidental delete |
| `npm run dynamo:init` | Initialize DynamoDB tables | First-time setup |
| `npm run dynamo:cv` | Upload local CV to DynamoDB | Sync CV data |
| `npm run dynamo:profile` | Upload local profile to DynamoDB | Sync profile data |
| `npm run db:check` | Validate portal configurations | Pre-scan health check |

## Local Development Setup

### Start Services

```bash
docker compose up -d
```

This starts:
- **Postgres** — `localhost:5432` (careerops/careerops123)
- **MinIO** — `localhost:9000` (admin/careerops123), UI: `localhost:9001`
- **DynamoDB Local** — `localhost:8000`

### Initialize Database

```bash
# Create tables (first time only)
npm run db:migrate:multitenant

# Initialize DynamoDB
npm run dynamo:init

# Upload sample CV and profile
npm run dynamo:cv
npm run dynamo:profile
```

### Verify Setup

```bash
# Test Postgres connectivity
npm run portals -- list

# Test MinIO connectivity
npm run evaluate:dry -- --limit 1

# Test DynamoDB connectivity
npm run dynamo:cv
```

## Database Maintenance

### Backfill Scores

Update all application rows with new score calculations (e.g., if you change the weighting in `src/lib/prompt.ts`):

```bash
npm run db:backfill             # Apply changes to all apps
npm run db:backfill:dry         # Preview changes (dry-run)
```

This:
1. Fetches all Evaluated applications
2. Re-evaluates the score based on the report markdown
3. Updates Postgres with new scores
4. Shows what changed

**When to use:**
- After changing score weighting in `src/lib/prompt.ts`
- After bulk JD updates
- To fix parsing bugs in `parseScore()`

### Normalize Keywords

Deduplicate and normalize title-filter keywords:

```bash
npm run db:normalize-keywords          # Apply changes
npm run db:normalize-keywords:dry      # Preview (dry-run)
```

**When to use:**
- After manually editing keywords in database
- To remove case-sensitivity issues
- After bulk keyword import

### Check Portal Health

Validate that all portals are correctly configured:

```bash
npm run db:check
```

Output:
```
Portal health check:
✓ Anthropic — https://jobs.anthropic.com/ (Ashby)
✓ Google — API configured (Greenhouse)
✗ UnknownCorp — No API or careers URL
⚠ DisabledCorp — Disabled (skipped during scan)

7 portals checked: 5 OK, 1 misconfigured, 1 disabled
```

**When to use:**
- Before running a scan
- After adding new portals
- To diagnose scan failures

### Restore Applications

Restore applications from backup (if you accidentally deleted some):

```bash
npm run db:restore             # Restore from backup
npm run db:restore:dry         # Preview (dry-run)
```

**When to use:**
- After accidental deletion
- To restore from a previous state
- To merge two databases

## Data Migration

### Migrate to Different MinIO Bucket

If you want to move all reports to a different bucket:

```bash
# 1. Update .env with new bucket credentials
MINIO_BUCKET=careerops-prod

# 2. Run migration
npm run db:migrate-bucket           # Migrate all reports
npm run db:migrate-bucket:dry       # Preview (dry-run)

# 3. Verify
npm run db:check
```

### Migrate to Multi-Tenant (First Time Only)

If starting fresh, initialize the multi-user schema:

```bash
npm run db:migrate-multitenant         # Apply migration
npm run db:migrate-multitenant:dry     # Preview (dry-run)
```

This:
1. Creates User table (if not exists)
2. Adds userId column to Application (if not exists)
3. Creates default user (from `CAREER_OPS_USER_EMAIL`)
4. Associates existing applications to that user

## DynamoDB Management

### Initialize DynamoDB Tables

```bash
npm run dynamo:init    # Create tables in DynamoDB Local or AWS
```

Creates:
- `CVs` table (partition key: userId)
- `Profiles` table (partition key: userId)

### Upload CV to DynamoDB

```bash
npm run dynamo:cv
```

Reads `/cv.md` and uploads to DynamoDB `CVs` table under the current user.

### Upload Profile to DynamoDB

```bash
npm run dynamo:profile
```

Reads `/config/profile.yml` and uploads to DynamoDB `Profiles` table under the current user.

## Troubleshooting

### Postgres Connection Failed

**Error:**
```
error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:**
```bash
# Check if Postgres is running
docker compose ps postgres

# If not, start it
docker compose up -d postgres

# Verify connectivity
psql postgresql://careerops:careerops123@localhost:5432/careerops -c "SELECT version();"
```

### MinIO Connection Failed

**Error:**
```
ECONNREFUSED: connection refused 127.0.0.1:9000
```

**Fix:**
```bash
# Check if MinIO is running
docker compose ps minio

# If not, start it
docker compose up -d minio minio-init

# Verify bucket exists (UI)
open http://localhost:9001
# Login: admin / careerops123
```

### DynamoDB Connection Failed

**Error:**
```
Could not connect to the endpoint URL: http://localhost:8000
```

**Fix:**
```bash
# Check if DynamoDB Local is running
docker compose ps dynamodb

# If not, start it
docker compose up -d dynamodb dynamo-init

# Verify tables exist
npm run dynamo:init
```

### Out of Sync: CLI vs Web Dashboard

**Symptom:** CLI shows different data than web dashboard.

**Diagnosis:**
```bash
# Check user IDs
echo "CLI user: $CAREER_OPS_USER_EMAIL"
# Browser: DevTools → Application → Cookies → sessionToken

# List applications (should be same count)
npm run tracker -- list | wc -l
# Web dashboard shows N applications
```

**Fix:**
1. Ensure `CAREER_OPS_USER_EMAIL` matches your OAuth email
2. Check Postgres: `psql ... -c "SELECT COUNT(*) FROM \"Application\" WHERE \"userId\" = '...';"`
3. Restart both CLI and web if needed

### Scan Returns 0 Results

**Symptom:** Scan completes but finds no jobs.

**Diagnosis:**
```bash
# Check portals
npm run portals -- list
# Should show at least one enabled portal

# Check keywords
npm run portals -- keywords list
# Should show at least one positive keyword
```

**Fix:**
```bash
# Add a portal if missing
npm run portals -- add --name "Acme" --url "https://acme.ashbyhq.com/..."

# Add positive keywords if missing
npm run portals -- keywords add --kind positive --value "software engineer"

# Try scan again
npm run scan:fallback
```

### Evaluate Fails on Specific Job

**Error:**
```
❌ Failed to evaluate job: JD extraction timeout
```

**Fix:**
1. Check job URL is valid: `curl "https://..."`
2. Test JD extraction: `npm run evaluate:dry -- --job <uuid>`
3. Try different timeout: Edit `src/lib/jd.ts` `PAGE_TIMEOUT_MS`
4. If site blocks Playwright, manually fetch and edit the Application row

### LLM Rate Limited

**Error:**
```
429 Too Many Requests
```

**Fix:**
```bash
# Reduce concurrency
npm run evaluate -- --limit 1 --concurrency 1

# Wait a few minutes
sleep 300

# Try again
npm run evaluate
```

## Monitoring

### Application Count Over Time

```bash
psql postgresql://careerops:careerops123@localhost:5432/careerops -c \
  "SELECT date_trunc('day', \"createdAt\") as day, COUNT(*) FROM \"Application\" GROUP BY day ORDER BY day DESC LIMIT 30;"
```

### Average Score by Company

```bash
psql postgresql://careerops:careerops123@localhost:5432/careerops -c \
  "SELECT company, COUNT(*), AVG(CAST(split_part(score, '/', 1) AS FLOAT)) as avg_score FROM \"Application\" WHERE score IS NOT NULL GROUP BY company ORDER BY avg_score DESC;"
```

### Disk Usage (MinIO)

```bash
du -sh ./minio_data/
```

### Database Size (Postgres)

```bash
psql postgresql://careerops:careerops123@localhost:5432/careerops -c \
  "SELECT pg_size_pretty(pg_database_size('careerops'));"
```

## Backup & Restore

### Full Backup

```bash
#!/bin/bash
# Backup everything

# 1. Postgres dump
pg_dump -h localhost -U careerops careerops > backup-$(date +%Y%m%d).sql

# 2. MinIO reports
mc mirror minio/careerops ./backup-minio-$(date +%Y%m%d)/

# 3. DynamoDB export (AWS SDK required)
aws dynamodb scan --table-name CVs > backup-cvs-$(date +%Y%m%d).json
aws dynamodb scan --table-name Profiles > backup-profiles-$(date +%Y%m%d).json

echo "Backup complete: backup-$(date +%Y%m%d).*"
```

### Restore Postgres

```bash
psql -h localhost -U careerops careerops < backup-20240115.sql
```

### Restore MinIO

```bash
mc mirror ./backup-minio-20240115/ minio/careerops/
```

## Performance Tuning

### Speed Up Scan

```bash
# Increase API concurrency
npm run scan -- --concurrency 20

# Reduce browser instances if crashing
npm run scan:fallback -- --browser-concurrency 4
```

### Speed Up Evaluate

```bash
# Parallel LLM calls
npm run evaluate -- --concurrency 16 --limit 50

# Or batch process in parallel
for i in {1..5}; do npm run evaluate -- --limit 10 & done
```

### Database Query Optimization

Check slow queries:
```bash
# Enable query logging in Postgres
psql -h localhost -U careerops careerops -c \
  "ALTER DATABASE careerops SET log_min_duration_statement = 1000;"

# View logs
docker compose logs postgres | grep "duration:"
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/backfill-scores.ts` | Backfill score calculation |
| `scripts/normalize-keywords.ts` | Deduplicate keywords |
| `scripts/check-portals.ts` | Validate portals |
| `scripts/restore-recovered.ts` | Restore applications from backup |
| `scripts/migrate-bucket.ts` | Migrate MinIO buckets |
| `scripts/migrate-to-multitenant.ts` | Initialize multi-user schema |
| `scripts/init-dynamo.ts` | Initialize DynamoDB tables |
| `scripts/get-cv.ts` | Upload CV to DynamoDB |
| `scripts/get-profile.ts` | Upload profile to DynamoDB |

## See Also

- [Troubleshooting](./troubleshooting.md) — Common problems and fixes
- [CLI Reference](./cli.md) — Full command catalog
- [Database Maintenance](./maintenance.md) — Advanced database operations
- [Architecture Overview](../architecture/overview.md) — How components fit together
