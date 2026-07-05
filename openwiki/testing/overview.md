# Testing Overview

CareerOps has comprehensive test coverage for core libraries, with unit tests and end-to-end tests.

## Test Setup

### Run Tests

```bash
# Unit tests (watches mode)
npm run test:watch

# Unit tests (single run)
npm run test

# Coverage report
npm run test:coverage

# E2E tests
npm run test:e2e
```

### Configuration Files

- `vitest.config.ts` — Unit test configuration
- `vitest.e2e.config.ts` — E2E test configuration
- `tests/` — Test files and fixtures

## Unit Tests

Unit tests use **Vitest** and test individual library modules in isolation.

### Test Files

```
tests/
├── candidate-loader.test.ts     Load CV + profile from storage
├── keywords.test.ts             Title-filter keyword matching
├── matching.test.ts             Job filtering (title, location, engineering)
├── minio.test.ts                MinIO S3 storage operations
├── prefix.test.ts               Pre-flight validation checks
├── prompt.test.ts               Evaluation prompt building + score parsing
├── resume-extract.test.ts       Resume extraction from Markdown
├── scanner.test.ts              Job board scanning (API + browser)
├── storage.test.ts              Generic storage operations
├── text.test.ts                 String utilities (slugify, dedup, etc.)
├── tracker.test.ts              Application tracking (Postgres)
└── e2e/                         End-to-end tests with real services
    ├── dynamo-store.e2e.ts      DynamoDB storage
    ├── keywords-preflight.e2e.ts Keyword loading from Postgres
    ├── minio-storage.e2e.ts     MinIO upload/download
    ├── postgres-tracker.e2e.ts  Application persistence
    └── setup/
        ├── clients.ts           Database clients
        ├── fixtures.ts          Test data
        ├── global-setup.ts      Environment + Docker
        └── load-env.ts          Load .env for tests
```

### Example Unit Test

```typescript
// tests/prompt.test.ts
import { parseScore } from "@/lib/prompt";
import { describe, it, expect } from "vitest";

describe("parseScore", () => {
  it("parses OVERALL_SCORE: X/5 format", () => {
    const text = "## OVERALL_SCORE: 4.2/5";
    expect(parseScore(text)).toBe("4.2");
  });

  it("parses markdown bold format", () => {
    const text = "**OVERALL_SCORE:** **3.8 / 5**";
    expect(parseScore(text)).toBe("3.8");
  });

  it("returns null for invalid input", () => {
    expect(parseScore("no score here")).toBeNull();
  });
});
```

### Mocking Databases

Unit tests use mocks for Postgres and MinIO to avoid requiring running services:

```typescript
// tests/tracker.test.ts
import { vi } from "vitest";
import { db } from "@/lib/db";

// Mock Prisma client
vi.mock("@/lib/db", () => ({
  db: {
    application: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("readApplications", () => {
  it("fetches applications for a user", async () => {
    vi.mocked(db.application.findMany).mockResolvedValue([
      {
        id: "test-uuid",
        userId: "user-123",
        company: "Acme",
        role: "Engineer",
        score: "4.5/5",
        status: "Evaluated",
        date: "2024-01-15",
        pdf: "",
        reportName: "001-acme-2024-01-15.md",
        reportUrl: "http://...",
        url: "https://jobs.acme.com/...",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const apps = await readApplications("user-123");
    expect(apps).toHaveLength(1);
    expect(apps[0].company).toBe("Acme");
  });
});
```

## E2E Tests

E2E tests run against real (containerized) databases to test integration.

### E2E Setup

E2E tests use **Vitest** with `globalSetup` that:
1. Checks for running Docker services (Postgres, MinIO, DynamoDB)
2. Initializes databases with test fixtures
3. Loads `.env` for test credentials

### Example E2E Test

```typescript
// tests/e2e/postgres-tracker.e2e.ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db } from "@/lib/db";

describe("E2E: Postgres Tracker", () => {
  beforeAll(async () => {
    // Ensure database is initialized
    await db.$executeRawUnsafe("SELECT 1");
  });

  afterEach(async () => {
    // Clean up test data
    await db.application.deleteMany({
      where: { userId: "test-user" },
    });
  });

  it("creates and fetches an application", async () => {
    const app = await db.application.create({
      data: {
        userId: "test-user",
        company: "TestCorp",
        role: "Engineer",
        score: "4.5/5",
        status: "Evaluated",
        date: "2024-01-15",
        pdf: "",
        reportName: "001-test-2024-01-15.md",
        url: "https://test.example.com/jobs/123",
      },
    });

    const fetched = await db.application.findUnique({
      where: { id: app.id },
    });

    expect(fetched).toEqual(app);
  });
});
```

### Running E2E Tests

```bash
# Ensure services are running
docker compose up -d

# Run E2E tests
npm run test:e2e

# Run specific E2E test
npm run test:e2e tests/e2e/postgres-tracker.e2e.ts

# With output
npm run test:e2e -- --reporter=verbose
```

## Test Fixtures

Reusable test data defined in `tests/e2e/setup/fixtures.ts`:

```typescript
export const TEST_USER = {
  id: "test-user-123",
  email: "test@example.com",
  name: "Test User",
};

export const TEST_APPLICATION = {
  userId: TEST_USER.id,
  company: "TestCorp",
  role: "Senior Engineer",
  score: "4.5/5",
  status: "Evaluated",
  date: "2024-01-15",
  pdf: "✅",
  reportName: "001-testcorp-2024-01-15.md",
  url: "https://test.example.com/jobs/123",
};

export const TEST_PORTAL = {
  name: "TestPortal",
  careersUrl: "https://test.example.com/careers",
  enabled: true,
};
```

Use in tests:
```typescript
import { TEST_APPLICATION, TEST_USER } from "./setup/fixtures";

it("creates application", async () => {
  const app = await db.application.create({
    data: TEST_APPLICATION,
  });
  expect(app.company).toBe("TestCorp");
});
```

## Coverage

### Current Coverage

View with:
```bash
npm run test:coverage
# Check coverage/index.html
```

**Target:**
- Core libraries (`src/lib/`) — 80%+ coverage
- CLI orchestrators (`src/cli/`) — 40%+ coverage (mostly integration)
- Web API (`web/app/api/`) — 30%+ coverage (manual testing)

### Running Coverage

```bash
npm run test:coverage
open coverage/index.html
```

## Best Practices

### Writing Unit Tests

1. **Test behavior, not implementation**
   ```typescript
   // ✓ Good: Tests the result
   expect(parseScore("OVERALL_SCORE: 4.5/5")).toBe("4.5");

   // ✗ Bad: Tests implementation detail
   expect(text.match(/OVERALL_SCORE/)).toBeTruthy();
   ```

2. **Use descriptive test names**
   ```typescript
   // ✓ Good
   it("parses score in 'OVERALL_SCORE: X/5' format");

   // ✗ Bad
   it("parses score");
   ```

3. **Group related tests with describe**
   ```typescript
   describe("parseScore", () => {
     it("parses format A");
     it("parses format B");
     it("returns null for invalid input");
   });
   ```

4. **Mock external dependencies**
   ```typescript
   vi.mock("@/lib/minio");
   vi.mocked(uploadReport).mockResolvedValue("key");
   ```

### Writing E2E Tests

1. **Isolate test data**
   ```typescript
   const testUserId = `test-user-${Date.now()}`;
   // ... test ...
   await db.application.deleteMany({
     where: { userId: testUserId },
   });
   ```

2. **Use fixtures for common data**
   ```typescript
   import { TEST_APPLICATION } from "./setup/fixtures";
   ```

3. **Test realistic workflows**
   ```typescript
   // Create → Read → Update → Delete
   const created = await createApplication(...);
   const fetched = await getApplication(created.id);
   const updated = await updateApplication(fetched.id, ...);
   const deleted = await deleteApplication(updated.id);
   ```

## Continuous Integration

Tests run on every push via GitHub Actions (`.github/workflows/ci.yml`):

```yaml
- name: Run tests
  run: npm run check  # typecheck + lint + test
```

To run locally:
```bash
npm run check
```

## Debugging Tests

### Verbose Output

```bash
npm run test -- --reporter=verbose
```

### Debug Single Test

```bash
npm run test -- tests/prompt.test.ts --reporter=verbose
```

### Interactive Debugging

Use Vitest UI:
```bash
npm run test -- --ui
# Open browser to test dashboard
```

### Print Variables in Tests

```typescript
import { describe, it, expect } from "vitest";

it("logs variables", () => {
  const value = parseScore("...");
  console.log("value:", value);  // Shows in test output
  expect(value).toBe("4.5");
});
```

Run with:
```bash
npm run test -- --reporter=verbose
```

## Adding a New Test

1. **Create test file** in `tests/`
2. **Import test utilities**:
   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from "vitest";
   ```
3. **Write test cases**:
   ```typescript
   describe("myFunction", () => {
     it("does X when given Y", () => {
       expect(myFunction(Y)).toBe(X);
     });
   });
   ```
4. **Run test**:
   ```bash
   npm run test -- tests/my-function.test.ts
   ```

## Key Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Unit test config |
| `vitest.e2e.config.ts` | E2E test config |
| `tests/*.test.ts` | Unit tests |
| `tests/e2e/*.e2e.ts` | E2E tests |
| `tests/e2e/setup/fixtures.ts` | Test data |
| `tests/e2e/setup/global-setup.ts` | Test env setup |

## See Also

- [Architecture Overview](../architecture/overview.md) — How to structure testable code
- [Operations: Debugging](../operations/troubleshooting.md) — Debugging failures
