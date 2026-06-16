# CarrerOps

> AI-powered job-search pipeline: scan job boards, evaluate roles against your CV with an LLM, generate ATS-friendly PDFs, and track everything in a markdown ledger with a Go TUI dashboard.

CarrerOps automates the repetitive parts of a focused job search:

1. **Scan** — discover relevant roles across the companies listed in `portals.yml` (Greenhouse / Ashby / Lever APIs, with a Playwright browser fallback).
2. **Evaluate** — fetch each job description and run a structured A–F evaluation through an OpenAI-compatible LLM, writing a scored report per role.
3. **PDF** — render a personalized, ATS-parseable CV from an HTML template.
4. **Track** — view and manage the pipeline in an interactive terminal dashboard.

---

## Requirements

- **Node.js >= 20** (developed on Node 22)
- **Go >= 1.24** (only for the dashboard)
- Playwright's Chromium (installed automatically with the `playwright` dependency; run `npx playwright install chromium` if missing)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   then fill in OPENCODE_API_KEY and/or NVIDIA_API_KEY

# 3. Provide your data (these are git-ignored)
#   - cv.md                  your canonical CV
#   - config/profile.yml     target roles, comp, location
#   - portals.yml            companies to scan
```

## Usage

All commands run via `npm run <script>` (powered by [`tsx`](https://github.com/privatenumber/tsx), no build step needed):

| Command | Description |
|---|---|
| `npm run scan` | Scan structured job-board APIs and refresh `data/applications.md`. |
| `npm run scan:fallback` | Scan + Playwright browser fallback for non-API boards. |
| `npm run evaluate` | Evaluate up to 5 pending `N/A` jobs via the LLM. |
| `npm run evaluate:all` | Evaluate up to 50 pending jobs. |
| `npm run evaluate:dry` | Fetch JDs only — skip the AI call and any writes. |
| `npm run pdf -- <in.html> <out.pdf> [--format=a4\|letter]` | Render an HTML CV to PDF. |

### Typical flow

```bash
npm run scan:fallback     # discover roles → writes data/applications.md
npm run evaluate:all      # score pending roles → writes reports/*.md
cd dashboard && go run .  # browse the pipeline
```

### LLM providers

`evaluate` resolves a provider by name (`--provider`), checking built-ins first
and then any custom providers in `~/.config/opencode/opencode.jsonc`.

| Provider | Base URL | Default model | Auth env var |
|---|---|---|---|
| `nvidia` (default) | `https://integrate.api.nvidia.com/v1` | `openai/gpt-oss-120b` | `NVIDIA_API_KEY` |
| `zen` | `https://opencode.ai/zen/v1` | `deepseek-v4-flash-free` | `OPENCODE_API_KEY` |

Override at runtime:

```bash
npm run evaluate -- --provider zen --model deepseek-v4-flash-free --limit 10
```

You can also set defaults via `CAREER_OPS_PROVIDER` / `CAREER_OPS_MODEL` in `.env`.

## Project structure

```
src/
  cli/              Executable entrypoints (thin orchestration)
    scan.ts         Job-board scanner
    evaluate.ts     LLM evaluation agent
    pdf.ts          HTML → PDF renderer
  lib/              Pure, unit-tested building blocks
    args.ts         Argv parsing
    concurrency.ts  mapLimit + semaphore
    env.ts          .env loading + requireEnv
    jd.ts           Job-description extraction
    llm.ts          Provider resolution + chat completion
    logger.ts       Leveled console logging
    matching.ts     Title/engineering/location/high-signal filters
    paths.ts        Centralized project paths
    pdf.ts          Chromium PDF rendering
    portals.ts      portals.yml parser
    prompt.ts       Evaluation prompt + score parsing
    scanner.ts      Greenhouse/Ashby/Lever + browser scraping
    text.ts         String helpers (slugify, dedup keys, ...)
    tracker.ts      applications.md parsing + report writing
  types.ts          Shared domain types
tests/              Vitest unit tests
dashboard/          Go (Bubble Tea) terminal UI
```

## Development

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint (flat config)
npm run format        # Prettier --write
npm run test          # Vitest
npm run test:coverage # Vitest + v8 coverage
npm run check         # typecheck + lint + test
npm run build         # compile to dist/
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs format-check, lint,
typecheck, tests with coverage, and the build on every push/PR, plus a Go
build/vet for the dashboard.

## Docker

The image is based on the official Playwright image so Chromium and its system
dependencies are preinstalled.

```bash
docker build -t career-ops .

# Run the scanner against your local working tree (mount it as a volume)
docker run --rm --env-file .env -v "$PWD:/work" -w /work \
  career-ops node /app/dist/cli/scan.js --compact
```

## Data & privacy

Personal data is **git-ignored** by design (`cv.md`, `config/profile.yml`,
`portals.yml`, `data/*`, `reports/*`, `output/*`). Secrets live only in `.env`
(also git-ignored); never commit real API keys — see `.env.example`.

## License

MIT
