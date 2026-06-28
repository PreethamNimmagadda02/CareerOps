/**
 * Loads the repo-root `.env` into process.env before any test module imports
 * the data-store singletons (which read DATABASE_URL / DYNAMODB_ENDPOINT /
 * MINIO_* at construction time).
 */
import "dotenv/config";
