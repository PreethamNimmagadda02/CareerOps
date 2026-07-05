# REST API Reference

Complete reference for the CareerOps web API endpoints.

## Base URL

```
http://localhost:3000/api  (local development)
https://careerops.example.com/api  (production)
```

## Authentication

All endpoints require a valid NextAuth session (automatic via HTTP-only cookie). If not authenticated, endpoints return `401 Unauthorized`.

## Endpoints

### Applications

#### GET /api/applications

Fetch all applications for the signed-in user.

**Request:**
```
GET /api/applications
```

**Response:** `200 OK`
```json
{
  "applications": [
    {
      "num": "550e8400-e29b-41d4-a716-446655440000",
      "date": "2024-01-15",
      "company": "Anthropic",
      "role": "Senior Platform Engineer",
      "score": 4.5,
      "scoreRaw": "4.5/5",
      "status": "Evaluated",
      "normStatus": "Evaluated",
      "hasPdf": true,
      "reportNumber": "001",
      "reportPath": "001-anthropic-2024-01-15.md",
      "reportUrl": "http://localhost:9000/careerops/001-anthropic-2024-01-15.md",
      "jobUrl": "https://jobs.anthropic.com/...",
      "archetype": "AI Platform",
      "tldr": "Build AI infrastructure for model training",
      "remote": true,
      "comp": "$180–220K + equity"
    }
  ]
}
```

**Query Parameters:**
- None currently

**Filters:** (implemented in component)
- Status tab (Evaluated, Applied, Interview, etc.)
- Sort (score, date, company, status)
- Search (company name)

#### PATCH /api/applications

Update an application's status.

**Request:**
```
PATCH /api/applications
Content-Type: application/json

{
  "num": "550e8400-e29b-41d4-a716-446655440000",
  "newStatus": "Applied"
}
```

**Valid Statuses:**
```
Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP
```

**Response:** `200 OK`
```json
{ "ok": true }
```

**Error Responses:**
```json
{ "error": "Application not found" }  // 404
{ "error": "Invalid status" }  // 400
{ "error": "newStatus is required" }  // 400
```

### Metrics

#### GET /api/metrics

Get aggregate statistics for the dashboard.

**Request:**
```
GET /api/metrics
```

**Response:** `200 OK`
```json
{
  "totalApplications": 42,
  "statusCounts": {
    "Evaluated": 25,
    "Applied": 12,
    "Interview": 3,
    "Offer": 1,
    "Rejected": 1,
    "Discarded": 0
  },
  "averageScore": 3.8,
  "topScore": 4.8,
  "pdfCount": 15,
  "remoteCount": 38
}
```

### Reports

#### GET /api/reports/:reportName

Fetch a single evaluation report.

**Request:**
```
GET /api/reports/001-anthropic-2024-01-15.md
```

**Response:** `200 OK`
```json
{
  "content": "# 001 — Anthropic — Senior Platform Engineer\n\n## ARCHETYPE\n...",
  "header": {
    "number": "001",
    "company": "Anthropic",
    "role": "Senior Platform Engineer",
    "url": "https://jobs.anthropic.com/...",
    "archetype": "AI Platform",
    "score": "4.5/5"
  }
}
```

**Error Response:** `404 Not Found`
```json
{ "error": "Report not found" }
```

### Pipeline

#### POST /api/pipeline/:command

Run a pipeline command (scan, evaluate, etc.) with streaming output.

**Commands:**
- `scan` — Run `npm run scan`
- `scan:fallback` — Run `npm run scan:fallback`
- `evaluate` — Run `npm run evaluate`
- `evaluate:all` — Run `npm run evaluate:all`
- `evaluate:dry` — Run `npm run evaluate:dry`

**Request:**
```
POST /api/pipeline/scan
Content-Type: application/json

{
  "concurrency": 12,
  "fallback": true
}
```

**Response:** `200 OK` (streaming text/event-stream)
```
data: {"type": "log", "level": "info", "message": "Starting scan..."}
data: {"type": "log", "level": "info", "message": "Scanning Anthropic..."}
data: {"type": "log", "level": "info", "message": "Found 5 new roles"}
data: {"type": "complete", "status": "success"}
```

**Log Event Format:**
```json
{
  "type": "log",
  "level": "info|warn|error|debug",
  "message": "Human-readable message"
}
```

**Completion Event:**
```json
{
  "type": "complete",
  "status": "success|error",
  "message": "Optional error message"
}
```

**Error Response:** `400 Bad Request`
```json
{ "error": "Invalid command: xyz" }
```

### Profile

#### GET /api/profile

Get the signed-in user's profile.

**Request:**
```
GET /api/profile
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe",
    "image": null,
    "resumeKey": "resumes/user-123.pdf",
    "resumeUpdatedAt": "2024-01-15T10:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

#### POST /api/profile/resume

Upload a resume file.

**Request:**
```
POST /api/profile/resume
Content-Type: multipart/form-data

file: <pdf-file>
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "key": "resumes/user-123.pdf",
  "url": "http://localhost:9000/careerops/resumes/user-123.pdf"
}
```

**Error Responses:**
```json
{ "error": "No file provided" }  // 400
{ "error": "File must be a PDF" }  // 400
{ "error": "File too large (max 10MB)" }  // 413
```

### Keywords

#### GET /api/keywords

List title-filter keywords for the user.

**Request:**
```
GET /api/keywords
```

**Response:** `200 OK`
```json
{
  "keywords": [
    {
      "id": "kw-123",
      "kind": "positive",
      "value": "software engineer"
    },
    {
      "id": "kw-124",
      "kind": "positive",
      "value": "backend engineer"
    },
    {
      "id": "kw-125",
      "kind": "negative",
      "value": "sales engineer"
    }
  ]
}
```

#### POST /api/keywords

Add a new keyword.

**Request:**
```
POST /api/keywords
Content-Type: application/json

{
  "kind": "positive",
  "value": "platform engineer"
}
```

**Response:** `200 OK`
```json
{
  "keyword": {
    "id": "kw-126",
    "kind": "positive",
    "value": "platform engineer"
  }
}
```

**Error Responses:**
```json
{ "error": "Keyword already exists" }  // 400
{ "error": "Invalid kind (must be positive or negative)" }  // 400
```

#### DELETE /api/keywords/:id

Delete a keyword.

**Request:**
```
DELETE /api/keywords/kw-125
```

**Response:** `200 OK`
```json
{ "ok": true }
```

**Error Response:** `404 Not Found`
```json
{ "error": "Keyword not found" }
```

### Onboarding (Optional)

#### POST /api/onboarding/:action

Onboarding actions for first-time setup (e.g., launch pad intro).

**Actions:**
- `start` — Begin onboarding
- `complete` — Mark onboarding complete

**Request:**
```
POST /api/onboarding/start
```

**Response:** `200 OK`
```json
{ "ok": true }
```

## Response Format

All responses are JSON. Success responses use HTTP 2xx status codes. Error responses use HTTP 4xx or 5xx.

### Success Response
```json
{
  "data": { /* response payload */ }
}
```

### Error Response
```json
{
  "error": "Human-readable error message"
}
```

## Rate Limiting

Currently no rate limiting. Recommend adding per-user rate limits in production:

```typescript
// Example: 100 requests per minute per user
const rateLimit = new Map<string, number>();

function checkRateLimit(userId: string) {
  const count = rateLimit.get(userId) ?? 0;
  if (count > 100) throw new Error("Rate limit exceeded");
  rateLimit.set(userId, count + 1);
  setTimeout(() => rateLimit.delete(userId), 60000);
}
```

## CORS

CORS is not configured (dashboard is same-origin). If building a separate client:

```typescript
// next.config.mjs
export default {
  headers: [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: 'https://client.example.com' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE' },
      ],
    },
  ],
};
```

## Error Handling

Always check response status and error field:

```typescript
const response = await fetch('/api/applications');
const data = await response.json();

if (!response.ok) {
  console.error('API error:', data.error);
  return;
}

console.log('Success:', data.applications);
```

## See Also

- [Web Dashboard Overview](./overview.md)
- [Authentication](./auth.md)
