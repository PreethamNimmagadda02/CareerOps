import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The repo root (parent of web/) is where route handlers read data/ and reports/.
  outputFileTracingRoot: join(__dirname, ".."),
  // Keep these node-oriented libs out of the webpack bundle — they're loaded at
  // runtime by route handlers (resume extraction, and ioredis for the shared
  // KV layer, which uses Node `net`/`tls` and must not be bundled).
  serverExternalPackages: ["unpdf", "mammoth", "ioredis"],
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb", // cover resume uploads up to 10 MB
    },
  },
  webpack(config) {
    // src/lib files use TypeScript ESM convention: `import './foo.js'` which
    // resolves to `./foo.ts` at compile time.  Webpack doesn't know this by
    // default, so we teach it to try .ts/.tsx before falling back to .js.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
