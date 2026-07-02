import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the production
  // image can run `node web/.next/standalone/web/server.js` with a minimal set
  // of node_modules instead of copying the entire web/node_modules tree.
  output: "standalone",
  // The repo root (parent of web/) is where route handlers read data/ and reports/.
  outputFileTracingRoot: join(__dirname, ".."),
  // Keep these node-oriented libs out of the webpack bundle — they're loaded at
  // runtime by the resume-extraction route handler.
  serverExternalPackages: ["unpdf", "mammoth", "openai"],
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
