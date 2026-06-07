# Career-Ops Agent Instructions

Career-Ops supports both Claude Code and GitHub Copilot. Use `.github/copilot-instructions.md` as the cross-agent baseline, and use `CLAUDE.md` only for Claude Code-specific command behavior.

## Operating Rules

- Preserve the user/system data contract in `DATA_CONTRACT.md`.
- Never edit user data files for system updates: `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`, `data/**`, `reports/**`, `output/**`, `jds/**`, and `interview-prep/**`.
- For new tracker entries, write TSV files under `batch/tracker-additions/` and run `node merge-tracker.mjs`; do not append new rows directly to `data/applications.md`.
- Always read `cv.md`, `config/profile.yml`, and `modes/_profile.md` when available before generating personalized career output.
- Never invent experience, metrics, compensation data, or application answers.
- Never submit job applications; stop before Submit/Send/Apply.

## Copilot Entry Points

- Repository instructions: `.github/copilot-instructions.md`
- Path instructions: `.github/instructions/*.instructions.md`
- Custom agents: `.github/agents/*.agent.md`
- Prompt files: `.github/prompts/*.prompt.md`
- Project skill: `.github/skills/career-ops/SKILL.md`
- Copilot hooks: `.github/hooks/*.json`

For Copilot in VS Code, `.vscode/settings.json` enables prompt files, instruction files, and `AGENTS.md` loading for this workspace.
