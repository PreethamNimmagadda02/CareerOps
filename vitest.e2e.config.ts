import { defineConfig } from "vitest/config";

/**
 * End-to-end test configuration.
 *
 * Unlike the unit suite (vitest.config.ts), these tests run the REAL library
 * code against the live docker-compose stack: Postgres, MinIO and DynamoDB
 * Local. They are intentionally excluded from `npm test` and run via
 * `npm run test:e2e` once `docker compose up -d` is healthy.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    setupFiles: ["tests/e2e/setup/load-env.ts"],
    globalSetup: ["tests/e2e/setup/global-setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Real datastores → run everything sequentially in a single process so
    // shared connections and ordered setup/teardown stay deterministic.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
