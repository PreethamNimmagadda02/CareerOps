# Setup Guide

## Prerequisites

- One AI agent path:
  - [Claude Code](https://claude.ai/code) installed and configured, or
  - VS Code with GitHub Copilot Chat enabled
- Node.js 18+ (for PDF generation and utility scripts)
- (Optional) Go 1.21+ (for the dashboard TUI)

## Quick Start (5 steps)

### 1. Clone and install

```bash
git clone https://github.com/ORION2809/carrer-ops.git
cd carrer-ops
npm install
npx playwright install chromium   # Required for PDF generation
```

### 2. Configure your profile

```bash
cp config/profile.example.yml config/profile.yml
```

Edit `config/profile.yml` with your personal details: name, email, target roles, narrative, proof points.

### 3. Add your CV

Create `cv.md` in the project root with your full CV in markdown format. This is the source of truth for all evaluations and PDFs.

(Optional) Create `article-digest.md` with proof points from your portfolio projects/articles.

### 4. Configure portals

```bash
cp templates/portals.example.yml portals.yml
```

Edit `portals.yml`:
- Update `title_filter.positive` with keywords matching your target roles
- Add companies you want to track in `tracked_companies`
- Customize `search_queries` for your preferred job boards

### 5. Start using with Claude Code

Open Claude Code in this directory:

```bash
claude
```

Then paste a job offer URL or description. Career-ops will automatically evaluate it, generate a report, create a tailored PDF, and track it.

### 5b. Start using with GitHub Copilot

Open the project in VS Code with GitHub Copilot Chat enabled. This repo includes:

- `.github/copilot-instructions.md` for repository-wide guidance
- `.github/agents/*.agent.md` for `@evaluator`, `@scanner`, `@batch`, and related agents
- `.github/prompts/*.prompt.md` for `/generate-pdf`, `/tracker`, `/outreach`, and other focused prompts
- `.github/instructions/*.instructions.md` for shared context and tracker conventions
- `.vscode/settings.json` to enable prompt files, instruction files, and `AGENTS.md` loading for the workspace

Then use `@auto-pipeline {paste JD}` or choose one of the agents/prompts from Copilot Chat.

## Available Commands

| Action | Claude Code | GitHub Copilot |
|--------|-------------|----------------|
| Evaluate an offer | Paste a URL or JD text | `@auto-pipeline` or `@evaluator` |
| Search for offers | `/career-ops scan` | `@scanner` |
| Process pending URLs | `/career-ops pipeline` | `@pipeline` |
| Generate a PDF | `/career-ops pdf` | `/generate-pdf` |
| Batch evaluate | `/career-ops batch` | `@batch` |
| Check tracker status | `/career-ops tracker` | `/tracker` |
| Fill application form | `/career-ops apply` | `@apply` |

## Verify Setup

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
node verify-copilot-migration.mjs  # Check Copilot customization layer
```

## Build Dashboard (Optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard            # Opens TUI pipeline viewer
```
