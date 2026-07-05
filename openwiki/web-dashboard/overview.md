# Web Dashboard: Next.js Application

The CareerOps web dashboard is a Next.js 14+ application (App Router) that provides a browser interface for managing job applications, viewing evaluations, and triggering pipeline workflows.

## Quick Start

```bash
cd web
npm install
npm run dev
# http://localhost:3000
```

## Key Features

- **Authentication** — OAuth via NextAuth v5 (Google, GitHub, or custom)
- **Applications Table** — View, sort, and filter all your applications
- **Metrics Dashboard** — Total applications, average score, PDF coverage, status counts
- **Report Viewer** — Full-screen markdown evaluation reports with formatting
- **Pipeline Runner** — Trigger scan and evaluate workflows from the browser with live logs
- **Keywords Manager** — Add/edit/delete title-filter keywords
- **Profile Manager** — Upload resume, edit profile, manage skills
- **Status Editing** — Change application status inline (writes to Postgres)
- **Real-time Sync** — Dashboard stays in sync with CLI and database

## Architecture

```
web/
├── app/
│   ├── api/               REST API routes (Next.js Route Handlers)
│   │   ├── applications/  GET, PATCH
│   │   ├── metrics/       GET
│   │   ├── reports/       GET
│   │   ├── pipeline/      POST (scan, evaluate)
│   │   ├── profile/       GET, POST
│   │   ├── keywords/      GET, POST, DELETE
│   │   └── auth/          NextAuth OAuth handler
│   │
│   ├── login/page.tsx     Login page (OAuth providers)
│   ├── profile/page.tsx   Profile management page
│   ├── page.tsx           Main dashboard (applications table)
│   ├── layout.tsx         Root layout
│   └── globals.css        Global styles (Tailwind)
│
├── components/
│   ├── dashboard.tsx      Main applications table + metrics
│   ├── report-modal.tsx   Full-screen report viewer
│   ├── pipeline-provider.tsx  Real-time pipeline execution
│   ├── keywords-manager.tsx   Keywords UI
│   ├── profile-view.tsx       Profile editor + resume upload
│   ├── metrics-cards.tsx      Metric cards (totals, scores, etc.)
│   ├── status-badge.tsx       Status display component
│   ├── status-menu.tsx        Status selector dropdown
│   └── ui/                    Primitives (modal, button, table, etc.)
│
├── lib/
│   ├── tracker.ts         Read/write applications + reports (calls src/lib/tracker.ts)
│   ├── reports.ts         Parse and render report markdown
│   ├── metrics.ts         Aggregate metrics
│   ├── status.ts          Status normalization
│   ├── session.ts         Get current session user
│   └── types.ts           TypeScript interfaces
│
├── types/
│   └── next-auth.d.ts     NextAuth type definitions
│
├── auth.ts                 Auth.js v5 configuration
├── auth.config.ts          OAuth provider setup
├── middleware.ts           Session validation middleware
├── next.config.mjs         Next.js configuration
├── tailwind.config.ts      Tailwind CSS configuration
└── tsconfig.json           TypeScript configuration
```

## Authentication Flow

### NextAuth v5 (Auth.js)

The dashboard uses **NextAuth v5** for OAuth authentication:

1. User visits `/` (redirected to `/login` if not authenticated)
2. Clicks "Sign in with Google" or "Sign in with GitHub"
3. OAuth provider redirects to `/api/auth/callback/{provider}`
4. NextAuth creates a session token (stored in secure HTTP-only cookie)
5. User is redirected to dashboard with session active
6. Middleware (`web/middleware.ts`) validates session for protected routes

### Configuration

Edit `/web/auth.config.ts` to add OAuth providers:

```typescript
// Google
{
  id: "google",
  name: "Google",
  type: "oidc",
  issuer: "https://accounts.google.com",
  clientId: process.env.AUTH_GOOGLE_ID,
  clientSecret: process.env.AUTH_GOOGLE_SECRET,
  // ...
}

// GitHub
{
  id: "github",
  name: "GitHub",
  type: "oidc",
  issuer: "https://github.com",
  clientId: process.env.AUTH_GITHUB_ID,
  clientSecret: process.env.AUTH_GITHUB_SECRET,
  // ...
}
```

### Environment Variables

```bash
# .env

# Auth.js configuration
AUTH_SECRET=<generate with: openssl rand -base64 33>
AUTH_URL=http://localhost:3000  # or https://yourdomain.com

# OAuth providers (configure at least one)
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
AUTH_GITHUB_ID=<from GitHub Settings>
AUTH_GITHUB_SECRET=<from GitHub Settings>
```

### See Also

- [Auth Section](./auth.md) — Detailed authentication guide

## REST API

The dashboard exposes REST endpoints for all operations. Most endpoints require authentication (validated via NextAuth session).

### Applications

#### GET `/api/applications`

**Purpose:** Fetch all applications for the signed-in user.

**Response:**
```json
{
  "applications": [
    {
      "num": "<uuid>",
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
      "reportUrl": "http://localhost:9000/careerops/...",
      "jobUrl": "https://jobs.anthropic.com/...",
      "archetype": "AI Platform",
      "tldr": "Build AI infrastructure",
      "remote": true,
      "comp": "$180–220K + equity"
    },
    // ... more applications
  ]
}
```

#### PATCH `/api/applications`

**Purpose:** Update an application's status.

**Request Body:**
```json
{
  "num": "<application-uuid>",
  "newStatus": "Applied"  // or: "Interview", "Offer", "Rejected", etc.
}
```

**Response:**
```json
{ "ok": true }
```

### Metrics

#### GET `/api/metrics`

**Purpose:** Get aggregate statistics for the dashboard.

**Response:**
```json
{
  "totalApplications": 42,
  "statusCounts": {
    "Evaluated": 25,
    "Applied": 12,
    "Interview": 3,
    "Offer": 1,
    "Rejected": 1
  },
  "averageScore": 3.8,
  "topScore": 4.8,
  "pdfCount": 15,
  "remoteCount": 38
}
```

### Reports

#### GET `/api/reports/:reportName`

**Purpose:** Fetch a single evaluation report.

**Request:** `GET /api/reports/001-anthropic-2024-01-15.md`

**Response:**
```
200 OK
Content-Type: application/json

{
  "content": "# 001 — Anthropic — Senior Platform Engineer\n...",
  "header": {
    "number": "001",
    "company": "Anthropic",
    "role": "Senior Platform Engineer",
    "url": "https://...",
    "archetype": "AI Platform",
    "score": 4.5
  }
}
```

### Pipeline

#### POST `/api/pipeline/:command`

**Purpose:** Trigger and stream pipeline commands (scan, evaluate, etc.).

**Request:**
```
POST /api/pipeline/scan
```

**Streaming Response:**
```
200 OK
Content-Type: text/event-stream

data: {"type": "log", "level": "info", "message": "Scanning Anthropic..."}
data: {"type": "log", "level": "info", "message": "Found 5 new roles"}
data: {"type": "complete", "status": "success"}
```

**Supported commands:**
- `scan` — Run `npm run scan`
- `scan:fallback` — Run `npm run scan:fallback`
- `evaluate` — Run `npm run evaluate`
- `evaluate:all` — Run `npm run evaluate:all`
- `evaluate:dry` — Run `npm run evaluate:dry`

### Profile

#### GET `/api/profile`

**Purpose:** Fetch the signed-in user's profile.

**Response:**
```json
{
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "name": "John Doe",
    "resumeKey": "resumes/user-123.pdf",
    "resumeUpdatedAt": "2024-01-15T10:00:00Z"
  }
}
```

#### POST `/api/profile/resume`

**Purpose:** Upload or update user's resume.

**Request:**
```
POST /api/profile/resume
Content-Type: multipart/form-data

file: <pdf-file>
```

**Response:**
```json
{
  "ok": true,
  "key": "resumes/user-123.pdf"
}
```

### Keywords

#### GET `/api/keywords`

**Purpose:** List title-filter keywords.

**Response:**
```json
{
  "keywords": [
    { "kind": "positive", "value": "software engineer" },
    { "kind": "positive", "value": "backend engineer" },
    { "kind": "negative", "value": "sales engineer" }
  ]
}
```

#### POST `/api/keywords`

**Purpose:** Add a keyword.

**Request:**
```json
{
  "kind": "positive",
  "value": "platform engineer"
}
```

#### DELETE `/api/keywords/:id`

**Purpose:** Delete a keyword.

**Response:**
```json
{ "ok": true }
```

### See Also

- [API Reference](./api.md) — Full endpoint documentation

## Components

### Dashboard (`dashboard.tsx`)

Main view with:
- **Metrics cards** (total, average score, PDF coverage, status breakdown)
- **Applications table** (sortable, filterable by status)
- **Status tabs** (Evaluated, Applied, Interview, etc.)
- **Grouped view toggle** (group by status or company)

### Report Modal (`report-modal.tsx`)

Full-screen report viewer:
- **Rendered markdown** (headings, tables, bold, code blocks)
- **Header info** (company, role, score, remote, comp estimate)
- **Job URL link** (open the original posting)
- **Copy report** functionality

### Pipeline Provider (`pipeline-provider.tsx`)

Real-time pipeline execution:
- **Command selection** (scan, evaluate, etc.)
- **Live logs** (streamed from server)
- **Progress indicator** (spinning, complete, error)
- **Copy logs** button

### Keywords Manager (`keywords-manager.tsx`)

Manage title-filter keywords:
- **List keywords** (positive + negative)
- **Add new** keyword
- **Delete** keyword
- **Real-time sync** with Postgres

### Profile View (`profile-view.tsx`)

User profile management:
- **Resume upload** (to MinIO S3)
- **Profile editor** (target roles, compensation, location, skills)
- **DynamoDB sync** (save to DynamoDB Profiles table)

## Styling

CareerOps uses **Tailwind CSS** + **shadcn/ui** primitives for consistent, modern styling.

Key configuration:
- **Color scheme:** Neutral grays + brand accent (blue)
- **Dark mode:** Supported via `next-themes` (toggle in user menu)
- **Responsive:** Mobile-first design (sm, md, lg breakpoints)
- **Components:** Button, Modal, Table, Select, Input, etc.

See `web/tailwind.config.ts` for theme customization.

## Deployment

### Local Development

```bash
npm run dev
# http://localhost:3000
```

### Production Build

```bash
npm run build
npm run start
# http://localhost:3000 (or configured port)
```

### Docker

Included in root `docker-compose.yml`:

```bash
docker compose up web
# http://localhost:3000
```

### Environment Requirements

For production:
- `AUTH_SECRET` must be a strong random string (use `openssl rand -base64 33`)
- `AUTH_URL` must be your public domain (e.g., `https://careerops.example.com`)
- `DATABASE_URL` must connect to production Postgres
- OAuth credentials must be for your production domain

## Troubleshooting

### Login redirects to /api/auth/error

**Cause:** Missing or invalid OAuth credentials.

**Fix:**
```bash
# Check .env has:
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
# (or AUTH_GITHUB_ID/SECRET)

# Verify OAuth app configuration:
# - Authorized redirect URI must be: <AUTH_URL>/api/auth/callback/{provider}
```

### Dashboard shows no applications

**Cause:** User is logged in but no applications exist for them.

**Fix:**
1. Run a scan: `npm run scan`
2. Check Postgres has data: `npm run tracker -- list`
3. Verify user ID matches: Check browser console for session user ID

### Report viewer shows blank

**Cause:** Report markdown didn't fetch or render.

**Fix:**
1. Check MinIO is running: `docker compose ps minio`
2. Check report exists: `npm run tracker -- list | grep <company>`
3. Check browser console for network errors

## Related Documentation

- [Authentication](./auth.md) — OAuth setup and session management
- [API Reference](./api.md) — Full endpoint documentation
- [Components](./components.md) — Component library overview
- [Architecture Overview](../architecture/overview.md) — How web fits in the system
