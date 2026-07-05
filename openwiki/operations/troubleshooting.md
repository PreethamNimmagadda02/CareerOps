# Troubleshooting Guide

Common issues and their fixes.

## Service Connectivity

### Postgres Won't Connect

**Error:**
```
error: connect ECONNREFUSED 127.0.0.1:5432
```

**Diagnosis:**
```bash
docker compose ps postgres
psql postgresql://careerops:careerops123@localhost:5432/careerops -c "SELECT 1"
```

**Fix:**
```bash
docker compose up -d postgres
docker compose logs postgres  # Check for errors
```

### MinIO Won't Connect

**Error:**
```
ECONNREFUSED 127.0.0.1:9000
```

**Fix:**
```bash
docker compose up -d minio minio-init
open http://localhost:9001  # UI check
```

### DynamoDB Won't Connect

**Error:**
```
Could not connect to the endpoint URL: http://localhost:8000
```

**Fix:**
```bash
docker compose up -d dynamodb
npm run dynamo:init
```

## Scan Issues

### Scan Fails with "No positive keywords"

```
❌ No title-filter keywords configured
```

**Fix:**
```bash
npm run portals -- keywords add --kind positive --value "software engineer"
npm run scan
```

### Scan Fails with "No portals"

```
❌ No portals in Postgres
```

**Fix:**
```bash
npm run portals -- add --name "Acme" --url "https://acme.ashbyhq.com"
npm run scan
```

### Scan Returns 0 Results

**Symptom:** Scan completes but finds zero jobs.

**Diagnosis:**
```bash
# Check keywords
npm run portals -- keywords list

# Check portals
npm run portals -- list

# Check if jobs exist on websites
curl "https://acme.ashbyhq.com"
```

**Fix:**
```bash
# Add positive keywords if missing
npm run portals -- keywords add --kind positive --value "engineer"

# Try with browser fallback
npm run scan:fallback
```

### Browser Crashes During Scan

**Error:**
```
Playwright: timeout waiting for selector
```

**Fix:**
```bash
# Reduce browser concurrency
npm run scan:fallback -- --browser-concurrency 2

# Disable problematic portals
npm run portals -- disable --name "UnstablePortal"

# Reinstall Chromium
npx playwright install chromium
```

### Job Count Lower Than Expected

**Cause:** Some jobs filtered by title keywords.

**Check:**
```bash
# Run with verbose logging
npm run scan -- --verbose

# Look for "skipped by title" count
```

**Fix:**
```bash
# Review and adjust keywords
npm run portals -- keywords list
npm run portals -- keywords add --kind positive --value "platform"  # Add broader keyword
npm run scan
```

## Evaluation Issues

### No Pending Jobs to Evaluate

**Error:**
```
No N/A applications found for user
```

**Fix:**
```bash
# Run scan first
npm run scan:fallback

# Check applications exist
npm run tracker -- list | grep "N/A"

# Verify user email
echo $CAREER_OPS_USER_EMAIL
```

### LLM API Key Invalid

**Error:**
```
Invalid API key
```

**Fix:**
```bash
# Get new key from https://build.nvidia.com or https://opencode.ai
# Update .env
NVIDIA_API_KEY=nvapi-xxxxx

# Source env
source .env

# Test
npm run evaluate -- --dry-run --limit 1
```

### LLM Rate Limited

**Error:**
```
429 Too Many Requests
```

**Fix:**
```bash
# Reduce concurrency and limit
npm run evaluate -- --limit 1 --concurrency 1

# Wait a few minutes
sleep 300

# Try again
npm run evaluate
```

### Job Description Extraction Fails

**Error:**
```
Failed to fetch JD from https://...
```

**Diagnosis:**
```bash
# Test URL manually
curl "https://..."

# Check if site blocks Playwright
npm run evaluate:dry -- --limit 1
```

**Fix:**
```bash
# Update Playwright
npx playwright install chromium

# Try different browser mode (headless vs headed)
# Edit src/lib/jd.ts: headless: false (temporary for debugging)

# If site blocks, skip this job manually
npm run tracker -- update --num <uuid> --status Discarded
```

### Report Upload Fails

**Error:**
```
MinIO error: Connection refused
```

**Fix:**
```bash
docker compose up -d minio
npm run evaluate -- --limit 1  # Retry
```

### Score Parsing Fails

**Symptom:** Job evaluated but score shows "N/A".

**Cause:** LLM output format doesn't match parser regex.

**Fix:**
```bash
# Check the actual report format
npm run tracker -- list --json | jq '.[0].reportPath'
# Then view report in browser

# Update parseScore() regex in src/lib/prompt.ts if format changed
# Test with:
npm run test tests/prompt.test.ts
```

## Web Dashboard Issues

### Login Redirects to Auth Error

**Error:**
```
/api/auth/error?error=invalid_grant
```

**Cause:** Invalid OAuth credentials.

**Fix:**
```bash
# 1. Check .env has correct credentials
echo $AUTH_GOOGLE_ID $AUTH_GOOGLE_SECRET

# 2. Verify redirect URI in OAuth provider
# Google Cloud Console → Credentials → OAuth 2.0 Client IDs
# Should include: http://localhost:3000/api/auth/callback/google

# 3. Regenerate credentials if stale
# Or create new OAuth app in Google Cloud
```

### Dashboard Shows No Data

**Symptom:** Logged in, but no applications visible.

**Diagnosis:**
```bash
# Check CLI user email
echo $CAREER_OPS_USER_EMAIL

# Check web user email (browser DevTools)
# Application → Cookies → session token → decode

# Check Postgres
psql -h localhost -U careerops careerops -c \
  "SELECT COUNT(*) FROM \"Application\" WHERE \"userId\" = '...'"
```

**Fix:**
```bash
# If using CLI, ensure CAREER_OPS_USER_EMAIL matches OAuth email
# If using different users, create more applications for logged-in user
npm run scan
```

### Report Viewer Shows Blank

**Symptom:** Click report, modal opens but no content.

**Diagnosis:**
```bash
# Check browser console for network errors
# DevTools → Console tab

# Check MinIO has the file
docker compose exec minio mc ls local/careerops/001-*
```

**Fix:**
```bash
# Restart MinIO
docker compose restart minio

# Re-evaluate job to re-upload report
npm run evaluate -- --job <uuid>
```

### AUTH_SECRET Mismatch Error

**Error:**
```
Invalid callback URL: ... does not match registered
```

**Fix:**
```bash
# Ensure AUTH_URL matches registered callback
# Update .env
AUTH_URL=http://localhost:3000  # or your real domain

# Restart web
cd web
npm run dev
```

## Database Issues

### Duplicate Application Error

**Error:**
```
Unique constraint failed on the fields: (`userId`,`url`)
```

**Cause:** Trying to insert duplicate application.

**Fix:**
```bash
# Check if application already exists
npm run tracker -- list | grep "Company Name"

# If yes, update instead of creating
npm run tracker -- update --num <uuid> --status Applied

# If not, there's a database state issue
# Contact admin or check Postgres directly
```

### Missing User on Application

**Error:**
```
Foreign key constraint failed on the field: `Application_userId_fkey`
```

**Cause:** Application references non-existent user.

**Fix:**
```bash
# Check user exists
psql -c "SELECT * FROM \"User\" WHERE \"id\" = '...';"

# If not, create user or delete orphan applications
psql -c "DELETE FROM \"Application\" WHERE \"userId\" = '...';"
```

### Schema Mismatch

**Error:**
```
Prisma Client Error: ... does not match database
```

**Fix:**
```bash
npm run postinstall
npx prisma generate
npm install
```

## Performance Issues

### Scan is Slow

**Cause:** Too many sequential API calls or browser instances.

**Fix:**
```bash
# Increase concurrency
npm run scan -- --concurrency 20 --browser-concurrency 8

# Or reduce if crashing
npm run scan -- --concurrency 5 --browser-concurrency 2
```

### Evaluate is Slow

**Cause:** Sequential LLM calls or JD extraction.

**Fix:**
```bash
# Increase concurrency
npm run evaluate -- --concurrency 16

# Or batch process in parallel (shell)
for i in {1..5}; do
  npm run evaluate -- --limit 10 &
done
wait
```

## Debugging

### Enable Verbose Logging

```bash
npm run scan -- --verbose
npm run evaluate -- --verbose
npm run tracker -- list --json | jq '.'
```

### View Docker Logs

```bash
docker compose logs postgres    # Postgres
docker compose logs minio       # MinIO
docker compose logs dynamodb    # DynamoDB
docker compose logs -f          # Follow all
```

### Check Environment

```bash
env | grep CAREER_OPS
env | grep DATABASE_URL
env | grep MINIO
env | grep DYNAMODB
```

### Test Individual Components

```bash
# Test Postgres
npm run portals -- list

# Test MinIO
npm run evaluate:dry -- --limit 1

# Test DynamoDB
npm run dynamo:cv

# Test LLM
npm run evaluate -- --dry-run --limit 1
```

## Contact & Support

For issues not covered here:

1. Check logs: `docker compose logs`
2. Check GitHub issues: https://github.com/PreethamNimmagadda02/CareerOps/issues
3. Review [Architecture Overview](../architecture/overview.md) for system design
4. See [Operations Overview](./overview.md) for maintenance tasks

## See Also

- [Operations Overview](./overview.md)
- [CLI Reference](./cli.md)
- [Architecture Overview](../architecture/overview.md)
