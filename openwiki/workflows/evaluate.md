# Evaluate Workflow: LLM-Powered Job Scoring

The evaluate workflow fetches job descriptions, scores them against your CV using an LLM, and stores detailed evaluation reports in MinIO.

## High-Level Flow

```
Postgres Application (status=N/A)
    ↓
Fetch up to N pending jobs
    ↓
For each job:
  1. Extract job description from URL (Playwright)
  2. Load CV + profile from DynamoDB
  3. Build evaluation prompt (A–F structure)
  4. Call LLM (NVIDIA, Zen, or custom)
  5. Parse score (weighted average 1–5)
  6. Upload report to MinIO (markdown)
  7. Update Postgres (score, reportUrl, status→Evaluated)
    ↓
Summary (evaluated count, average score, errors)
```

## Running an Evaluation

### Evaluate 5 Jobs (Default)

```bash
npm run evaluate
```

Evaluates up to 5 pending N/A jobs. Safe for frequent runs.

### Evaluate Many Jobs

```bash
npm run evaluate:all
```

Evaluates up to 50 pending jobs. Use for batch processing.

### Dry-Run (Fetch Only)

```bash
npm run evaluate:dry
```

Fetches job descriptions but skips LLM calls and database writes. Useful for testing job description extraction without spending API credits.

### Evaluation Options

```bash
npm run evaluate -- \
  --limit 10                 # Max jobs to evaluate (default 5)
  --job <uuid>               # Evaluate specific job by UUID
  --provider nvidia          # LLM provider: nvidia (default), zen, or custom
  --model deepseek-v4        # Model name
  --dry-run                  # Fetch JDs only, skip LLM
  --concurrency 8            # Parallel LLM calls (default 8)
```

## LLM Providers

CareerOps supports OpenAI-compatible LLM providers. Configuration is flexible:

### Built-In Providers

#### NVIDIA (Default)

- **Provider:** `nvidia`
- **Base URL:** `https://integrate.api.nvidia.com/v1`
- **Default Model:** `openai/gpt-oss-120b` (free, high quality)
- **Auth:** `NVIDIA_API_KEY` environment variable
- **Cost:** Free (quota-based)

Setup:
```bash
# 1. Get API key from https://build.nvidia.com
# 2. Set in .env:
NVIDIA_API_KEY=nvapi-xxxxx
CAREER_OPS_PROVIDER=nvidia
CAREER_OPS_MODEL=openai/gpt-oss-120b
```

#### Zen (OpenCode)

- **Provider:** `zen`
- **Base URL:** `https://opencode.ai/zen/v1`
- **Default Model:** `deepseek-v4-flash-free` (cheaper, still good quality)
- **Auth:** `OPENCODE_API_KEY` environment variable
- **Cost:** Pay-per-token (budget-friendly)

Setup:
```bash
# 1. Get API key from https://opencode.ai/auth
# 2. Set in .env:
OPENCODE_API_KEY=sk-xxxxx
# 3. Run with provider flag:
npm run evaluate -- --provider zen --model deepseek-v4-flash-free
```

### Custom Providers

Configure a custom OpenAI-compatible provider in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "providers": {
    "custom": {
      "baseUrl": "https://api.custom.com/v1",
      "defaultModel": "my-model-v1",
      "authEnvVar": "CUSTOM_API_KEY"
    }
  }
}
```

Then run:
```bash
npm run evaluate -- --provider custom --model my-model-v1
```

## Evaluation Structure (A–F)

Each job is evaluated across six dimensions:

### **A) Role Summary**

High-level classification:
- **Archetype:** AI Platform, Agentic/Automation, AI Solutions Architect, AI Forward Deployed, AI Transformation, Software Engineering, or Other
- **Domain:** What the company does (SaaS, infrastructure, consumer, etc.)
- **Seniority:** Level (junior, mid, senior, staff, etc.)
- **Remote:** Fully remote, hybrid, or on-site
- **TL;DR:** One-sentence summary

Example:
```
| Field     | Value                                       |
|-----------|---------------------------------------------|
| Archetype | AI Platform / LLMOps                        |
| Domain    | Infrastructure (cloud provider)             |
| Seniority | Senior (L5–L6)                              |
| Remote    | Fully remote                                |
| TL;DR     | Build training infra for foundational models|
```

### **B) CV Match**

Maps each job requirement to specific evidence from your CV:

| JD Requirement | CV Evidence | Strength |
|---|---|---|
| "5+ years distributed systems" | Project X: Designed Kafka pipeline (2020–2024) | Strong |
| "CUDA/GPU optimization" | **Gap** — no GPU projects listed | Gap |

**Gaps subsection:** Lists hard blockers and mitigation strategies:
- "No GPU experience" → Mitigation: "Can learn on the job; strong C++ foundation"

### **C) Level & Strategy**

- **Detected seniority** vs your natural level for this archetype
- **Framing strategy:** Specific phrases and proof points to emphasize
- **Downleveling assessment:** If the role is below your level, is it acceptable? Why?

Example:
```
Detected Level: Mid (L4)
Your Natural Level: Senior (L5)
Assessment: Downleveled by 1 level. Acceptable because:
- High-growth opportunity (greenfield platform)
- Compensation still strong
- Strategic alignment with AI focus
```

### **D) Compensation**

- **Estimated salary range** for the role, location, and seniority
- **Does it match your target?** (from your profile)
- **Total comp estimate** (salary + equity/bonus)

Example:
```
Estimated Range: $180–220K base + 20% bonus + RSUs
Your Target: $200K base + equity
Assessment: ✓ Meets target, upper end
```

### **E) CV Personalization (Top 5 Changes)**

Specific edits to your CV that would strengthen your application:

| # | Section | Current | Proposed | Why |
|---|---------|---------|----------|-----|
| 1 | Experience | "Led platform team" | "Scaled platform to 10M+ requests/day" | Specificity resonates with LLMOps focus |
| 2 | Skills | Add CUDA | Show GPU optimization capability |
| 3 | Projects | Expand X | Highlight distributed systems work |

### **F) Interview Prep (Top 5 STAR Stories)**

Ready-to-use STAR (Situation-Task-Action-Result) stories for common interview questions:

| # | JD Requirement | STAR Story | Result | Reflection |
|---|---|---|---|---|
| 1 | "Scalability at 100M+ users" | Led Project X from 1M to 100M DAU | 4x perf improvement | Emphasize growth mindset + execution |
| 2 | "Cross-functional collaboration" | Partnered with ML team on inference | Deployed in 3 weeks | Show communication + velocity |

## Score Breakdown

Each job is rated on **10 dimensions**, each 1–5:

1. **Technical Fit** — How well your skills match the role
2. **Level Match** — Seniority alignment
3. **Location/Remote** — Commute, work environment
4. **Growth Potential** — Learning opportunities
5. **Domain Fit** — Alignment with your career goals

**Weighting:**
- Technical Fit: **35%**
- Level Match: **20%**
- Location/Remote: **15%**
- Growth Potential: **15%**
- Domain Fit: **15%**

**OVERALL_SCORE = (Tech×0.35) + (Level×0.20) + (Location×0.15) + (Growth×0.15) + (Domain×0.15)**

Range: **1.0–5.0**

### Score Interpretation

- **4.5–5.0** — Excellent fit, apply immediately
- **4.0–4.4** — Very good fit, apply with light tweaks
- **3.5–3.9** — Good fit, consider applying if time permits
- **3.0–3.4** — Decent fit, monitor for improvements
- **2.5–2.9** — Marginal fit, skip unless desperate
- **<2.5** — Poor fit, skip

## Report Storage

Reports are stored in MinIO (S3-compatible object storage) with the naming convention:

```
{###}-{company-slug}-{YYYY-MM-DD}.md
```

Examples:
```
001-anthropic-2024-01-15.md
002-google-2024-01-16.md
003-openai-2024-01-17.md
```

**Reference in Postgres:**
- `Application.reportName` — MinIO object name (e.g., `001-anthropic-2024-01-15.md`)
- `Application.reportUrl` — Public URL (e.g., `http://localhost:9000/careerops/001-...md`)

## Candidate Context

The evaluation prompt includes your CV and profile. These are loaded from:

### CV (DynamoDB or Local File)

**Priority:**
1. DynamoDB (`Profiles` table, key = userId, field = `cv`)
2. Local file: `/cv.md` (fallback)

**Upload CV to DynamoDB:**
```bash
npm run dynamo:cv  # Reads from /cv.md and uploads to DynamoDB
```

### Profile (DynamoDB or Config File)

**Priority:**
1. DynamoDB (`Profiles` table, field = `profile`)
2. Local file: `/config/profile.yml` (fallback)

**Example profile (YAML):**
```yaml
name: John Doe
target_roles:
  - AI Platform Engineer
  - LLMOps Engineer
target_salary: 200000
target_location: Remote or San Francisco
excluded_roles:
  - QA Engineer
  - Sales Engineer
skills:
  - Python
  - Rust
  - Kubernetes
  - LLMs
education:
  - BS Computer Science, MIT
```

**Upload profile to DynamoDB:**
```bash
npm run dynamo:profile  # Reads from /config/profile.yml and uploads
```

## Performance & Cost

### Time Per Job

- **Fetch JD:** ~5–10 seconds
- **LLM call:** ~30–60 seconds (depends on provider)
- **Upload report + update DB:** ~5 seconds
- **Total:** ~50–80 seconds per job

**Batch evaluation (10 jobs):** ~8–13 minutes

### Cost Per Job

| Provider | Model | Cost |
|----------|-------|------|
| NVIDIA | `openai/gpt-oss-120b` | Free (quota) |
| Zen | `deepseek-v4-flash-free` | ~$0.01 |
| Custom | Varies | Varies |

**Estimate:** ~$0.10–$1.00 per evaluation depending on provider.

## Optimization Tips

### Speed Up Evaluations

- **Increase concurrency:** `--concurrency 16` (more parallel LLM calls)
- **Use faster provider:** `--provider zen` (cheaper & faster than NVIDIA)
- **Batch process:** `npm run evaluate -- --limit 50` (run once, do 50)

### Reduce Costs

- **Use cheaper model:** `--model deepseek-v3-free` (on Zen)
- **Dry-run first:** `npm run evaluate:dry` (no LLM cost, JD extraction only)
- **Selective evaluation:** Only evaluate top candidates (high title match score)

### Better Evaluations

- **Enhance your CV:** Make it detailed; LLM uses it extensively
- **Detailed profile:** Include target roles, comp, location, skills
- **Custom prompt:** Edit `/src/lib/prompt.ts` to add/change evaluation criteria

## Troubleshooting

### "API key not found"

**Error:**
```
❌ API key not set: NVIDIA_API_KEY or OPENCODE_API_KEY
```

**Fix:**
```bash
# 1. Get API key from https://build.nvidia.com or https://opencode.ai
# 2. Set in .env:
NVIDIA_API_KEY=nvapi-xxxxx
# 3. Source env:
source .env
npm run evaluate
```

### "No pending jobs to evaluate"

**Error:**
```
No N/A applications found for user.
```

**Fix:**
1. Run scan first: `npm run scan`
2. Verify scan added jobs: `npm run tracker -- list | grep "N/A"`
3. Check user email: `echo $CAREER_OPS_USER_EMAIL`

### "Job description extraction failed"

**Error:**
```
Failed to fetch JD from https://...
```

**Diagnosis:**
- Website may block Playwright
- URL may be expired or incorrect
- Playwright Chromium may not be installed

**Fix:**
```bash
# Install Chromium:
npx playwright install chromium

# Dry-run to test extraction:
npm run evaluate:dry -- --limit 1

# Check the specific URL manually:
curl "https://..."
```

### "LLM call failed" (timeout, rate limit, etc.)

**Error:**
```
LLM API error: 429 Too Many Requests
```

**Fix:**
- Reduce concurrency: `--concurrency 2`
- Reduce limit: `--limit 1`
- Wait a few minutes before retrying
- Check API dashboard for quota

### "Report upload failed"

**Error:**
```
MinIO error: Connection refused
```

**Fix:**
```bash
# Ensure MinIO is running:
docker compose ps minio

# If not, start it:
docker compose up -d minio

# Check credentials:
echo $MINIO_ENDPOINT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
```

## Typical Workflow

```bash
# 1. Scan for new jobs
npm run scan:fallback

# 2. View shortlist
npm run tracker -- list | grep "N/A"

# 3. Evaluate top 10
npm run evaluate -- --limit 10

# 4. View scores
npm run tracker -- list --json | jq '.[] | select(.score != null)' | head -5

# 5. Read full evaluation for top candidate
npm run tracker -- list | grep "highest score" | awk '{print $1}' > num.txt
# Open the report URL in browser

# 6. Update status based on evaluation
npm run tracker -- update --num <uuid> --status Applied
```

## Key Files

- `src/cli/evaluate.ts` — Main evaluation orchestrator
- `src/lib/llm.ts` — LLM provider integration
- `src/lib/prompt.ts` — Evaluation prompt and score parsing
- `src/lib/jd.ts` — Job description extraction
- `src/lib/minio.ts` — Report storage
- `src/lib/candidate-loader.ts` — CV/profile loading
- `src/lib/tracker.ts` — Database updates

## See Also

- [Workflows Overview](./overview.md)
- [Architecture Overview](../architecture/overview.md)
- [Storage & Data Models](../storage/overview.md)
