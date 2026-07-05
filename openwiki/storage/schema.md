# Database Schema Details

Complete reference for the CareerOps Postgres schema (Prisma ORM).

## Overview

The schema is defined in `prisma/schema.prisma` and uses Postgres as the database provider.

## Complete Schema

See the source file for authoritative schema:
```bash
cat prisma/schema.prisma
```

## Key Tables

### User
Multi-user authentication and metadata.

**Fields:**
- `id` (String, PK) — CUID primary key
- `email` (String, unique) — OAuth email
- `name` (String, optional)
- `image` (String, optional) — Avatar URL
- `createdAt`, `updatedAt` — Timestamps
- `resumeKey` (String, optional) — MinIO S3 key for uploaded resume
- `resumeUpdatedAt` (DateTime, optional)

**Relations:**
- `accounts` — OAuth Account records
- `sessions` — Session tokens
- `applications` — Application rows owned by this user
- `filterKeywords` — Title-filter keywords for this user

**Indexes:**
- `email` — UNIQUE

### Application
Job applications, the core data entity.

**Fields:**
- `id` (UUID, PK) — UUID primary key
- `userId` (String, FK) — Owner user
- `date` (String) — Application date (YYYY-MM-DD)
- `company` (String) — Company name
- `role` (String) — Job title
- `score` (String) — Score string (e.g., "4.5/5")
- `status` (AppStatus enum) — Current status
- `pdf` (String) — PDF indicator ("✅" or empty)
- `reportName` (String) — MinIO object key
- `reportUrl` (String, optional) — Public report URL
- `url` (String, optional) — Job posting URL
- `createdAt`, `updatedAt` — Timestamps

**Relations:**
- `user` — Owning User

**Indexes:**
- `(userId, url)` — UNIQUE (prevents duplicate applications per user)
- `(userId, createdAt DESC)` — For efficient listing and sorting

**Constraints:**
- Foreign key: `userId` → `User.id` (CASCADE delete)

### Portal
Scan targets (company career pages), shared globally.

**Fields:**
- `id` (UUID, PK)
- `name` (String, unique) — Portal name (company identifier)
- `careersUrl` (String, optional) — Direct careers page URL
- `api` (String, optional) — Custom API endpoint
- `enabled` (Boolean) — Enable/disable scanning
- `createdAt`, `updatedAt` — Timestamps

**Indexes:**
- `name` — UNIQUE

**No relations** — Portals are read-only references.

### FilterKeyword
Title-filter keywords, scoped per user.

**Fields:**
- `id` (UUID, PK)
- `userId` (String, FK) — Owner user
- `kind` (String) — "positive" or "negative"
- `value` (String) — Keyword value
- `createdAt`, `updatedAt` (optional)

**Relations:**
- `user` — Owning User

**Indexes:**
- `(userId, kind, value)` — UNIQUE (prevent duplicate keywords per user)
- `userId` — For efficient listing per user

### Account (Auth.js)
OAuth account linkage, managed by NextAuth.

**Fields:**
- `id` (String, PK)
- `userId` (String, FK)
- `type` (String) — OAuth type
- `provider` (String) — OAuth provider (google, github, etc.)
- `providerAccountId` (String)
- `refresh_token` (String, optional)
- `access_token` (String, optional)
- `expires_at` (Int, optional)
- `token_type`, `scope`, `id_token`, `session_state` (optional)

**Relations:**
- `user` — Associated User

**Indexes:**
- `(provider, providerAccountId)` — UNIQUE

### Session (Auth.js)
Session tokens, managed by NextAuth.

**Fields:**
- `id` (String, PK)
- `sessionToken` (String, unique)
- `userId` (String, FK)
- `expires` (DateTime)

**Relations:**
- `user` — Associated User

**Indexes:**
- `sessionToken` — UNIQUE
- `userId` — For session lookup

## Enums

### AppStatus
Application status values:

```
Evaluated    — LLM-scored, awaiting action
Applied      — You've submitted an application
Responded    — Company has responded (screen, take-home, etc.)
Interview    — Active interview process
Offer        — You have an offer
Rejected     — Company rejected you
Discarded    — You decided not to pursue
SKIP         — Mark to skip (not relevant)
```

## Queries & Operations

### Create Application

```typescript
const app = await db.application.create({
  data: {
    userId: "user-123",
    company: "Acme Corp",
    role: "Senior Engineer",
    score: "4.5/5",
    status: "Evaluated",
    date: "2024-01-15",
    pdf: "✅",
    reportName: "001-acme-2024-01-15.md",
    reportUrl: "http://...",
    url: "https://jobs.acme.com/...",
  },
});
```

### List Applications for User

```typescript
const apps = await db.application.findMany({
  where: { userId: "user-123" },
  orderBy: { createdAt: "desc" },
});
```

### Update Application Status

```typescript
const updated = await db.application.update({
  where: { id: "app-uuid" },
  data: { status: "Applied" },
});
```

### Find by URL (Unique Constraint)

```typescript
// Check if application already exists
const existing = await db.application.findUnique({
  where: {
    userId_url: {
      userId: "user-123",
      url: "https://jobs.acme.com/...",
    },
  },
});
```

### Delete Applications for User

```typescript
await db.application.deleteMany({
  where: { userId: "user-123" },
});
```

### List Portals (Scan Targets)

```typescript
const portals = await db.portal.findMany({
  where: { enabled: true },
});
```

### List Keywords for User

```typescript
const positiveKeywords = await db.filterKeyword.findMany({
  where: {
    userId: "user-123",
    kind: "positive",
  },
});
```

## Migrations

### Create a Migration

```bash
npx prisma migrate dev --name <descriptive-name>
```

Example:
```bash
npx prisma migrate dev --name add_resume_key_to_user
```

This:
1. Applies changes to your local database
2. Creates a migration file in `prisma/migrations/`
3. Updates `prisma/schema.prisma`

### Apply Migrations to Production

```bash
npx prisma migrate deploy
```

### Reset Local Database

⚠️ **Destructive — deletes all data**

```bash
npx prisma migrate reset
# or
npm run db:reset
```

## Troubleshooting

### Constraint Violation: Unique Index on (userId, url)

**Error:**
```
Unique constraint failed on the fields: (`userId`,`url`)
```

**Cause:** Attempting to insert a duplicate application (same user + URL).

**Fix:** Check if application already exists before inserting:
```typescript
const existing = await db.application.findUnique({
  where: { userId_url: { userId, url } },
});
if (existing) return;  // Skip duplicate
```

### Foreign Key Violation: User Does Not Exist

**Error:**
```
Foreign key constraint failed on the field: `Application_userId_fkey`
```

**Cause:** Application references a non-existent user.

**Fix:** Create user first:
```typescript
const user = await db.user.create({
  data: { email: "user@example.com" },
});
const app = await db.application.create({
  data: {
    userId: user.id,
    // ... other fields
  },
});
```

### Schema Mismatch: Prisma Client out of Sync

**Error:**
```
Code generation failed with `npm run postinstall`.
```

**Cause:** Schema changed, but Prisma client wasn't regenerated.

**Fix:**
```bash
npm run postinstall  # Regenerate client
npx prisma generate
npm install  # Full reinstall if still broken
```

## Related Documentation

- [Storage Overview](./overview.md) — Data storage architecture
- [Migrations](../operations/maintenance.md) — Database maintenance
