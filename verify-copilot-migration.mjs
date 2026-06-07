#!/usr/bin/env node
/**
 * verify-copilot-migration.mjs -- Validate the GitHub Copilot customization layer.
 *
 * Checks the repository files Copilot uses for workspace instructions, custom
 * agents, prompts, skills, instruction files, hooks, and VS Code prompt support.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
let errors = 0;
let warnings = 0;

function rel(path) {
  return path.replace(/\\/g, '/');
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function warn(message) {
  warnings++;
  console.log(`WARN: ${message}`);
}

function error(message) {
  errors++;
  console.log(`ERROR: ${message}`);
}

function read(path) {
  return readFileSync(join(ROOT, path), 'utf-8');
}

function assertExists(path) {
  if (!existsSync(join(ROOT, path))) {
    error(`Missing ${path}`);
    return false;
  }
  ok(`${path} exists`);
  return true;
}

function frontmatter(content, path) {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    error(`${path} is missing YAML frontmatter`);
    return null;
  }

  const end = normalized.indexOf('\n---', 4);
  if (end === -1) {
    error(`${path} has an unterminated YAML frontmatter block`);
    return null;
  }

  const raw = normalized.slice(4, end).trim();
  const map = new Map();
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

function filesIn(dir, suffix) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((file) => file.endsWith(suffix))
    .map((file) => rel(join(dir, file)));
}

console.log('\n=== career-ops Copilot migration check ===\n');

const requiredFiles = [
  '.github/copilot-instructions.md',
  '.github/instructions/shared-context.instructions.md',
  '.github/instructions/pipeline-data.instructions.md',
  '.github/skills/career-ops/SKILL.md',
  '.github/hooks/career-ops-session.json',
  '.github/workflows/batch-evaluate.yml',
  '.vscode/settings.json',
  'AGENTS.md',
];

for (const file of requiredFiles) assertExists(file);

if (existsSync(join(ROOT, '.github/copilot-instructions.md'))) {
  const instructions = read('.github/copilot-instructions.md');
  if (instructions.length > 4000) {
    warn(`.github/copilot-instructions.md is ${instructions.length} chars; Copilot code review may only use the first 4000 chars`);
  } else {
    ok('.github/copilot-instructions.md is within the 4000-char code review guidance window');
  }
}

const agents = filesIn('.github/agents', '.agent.md');
if (agents.length === 0) error('No .github/agents/*.agent.md files found');
for (const file of agents) {
  const fm = frontmatter(read(file), file);
  if (!fm) continue;
  if (!fm.has('description')) error(`${file} missing required description`);
  if (!fm.has('tools')) warn(`${file} has no tools list; Copilot will enable all tools`);
}
if (agents.length > 0) ok(`Found ${agents.length} custom agents`);

const prompts = filesIn('.github/prompts', '.prompt.md');
if (prompts.length === 0) error('No .github/prompts/*.prompt.md files found');
for (const file of prompts) {
  const fm = frontmatter(read(file), file);
  if (!fm) continue;
  if (!fm.has('description')) warn(`${file} has no description`);
  if (!fm.has('agent')) warn(`${file} has no agent frontmatter; it will use the current chat agent`);
}
if (prompts.length > 0) ok(`Found ${prompts.length} prompt files`);

const instructionFiles = filesIn('.github/instructions', '.instructions.md');
for (const file of instructionFiles) {
  const fm = frontmatter(read(file), file);
  if (!fm) continue;
  if (!fm.has('applyTo')) error(`${file} missing applyTo; it will not apply automatically in VS Code`);
}
if (instructionFiles.length > 0) ok(`Found ${instructionFiles.length} instruction files`);

if (existsSync(join(ROOT, '.github/skills/career-ops/SKILL.md'))) {
  const fm = frontmatter(read('.github/skills/career-ops/SKILL.md'), '.github/skills/career-ops/SKILL.md');
  if (fm) {
    if (!fm.has('name')) error('.github/skills/career-ops/SKILL.md missing required name');
    if (!fm.has('description')) error('.github/skills/career-ops/SKILL.md missing required description');
  }
}

if (existsSync(join(ROOT, '.github/hooks/career-ops-session.json'))) {
  try {
    const hookConfig = JSON.parse(read('.github/hooks/career-ops-session.json'));
    if (hookConfig.version !== 1) error('.github/hooks/career-ops-session.json must set version: 1');
    const sessionStart = hookConfig.hooks?.sessionStart;
    if (!Array.isArray(sessionStart)) {
      error('.github/hooks/career-ops-session.json must define hooks.sessionStart as an array');
    } else {
      for (const [index, hook] of sessionStart.entries()) {
        if (hook.type !== 'command') error(`sessionStart hook ${index} must use type: command`);
        if (!hook.bash && !hook.powershell) error(`sessionStart hook ${index} must define bash or powershell`);
        if (!Number.isInteger(hook.timeoutSec)) warn(`sessionStart hook ${index} has no integer timeoutSec`);
      }
    }
    ok('.github/hooks/career-ops-session.json parses as Copilot hook JSON');
  } catch (err) {
    error(`.github/hooks/career-ops-session.json is invalid JSON: ${err.message}`);
  }
}

if (existsSync(join(ROOT, '.github/workflows/batch-evaluate.yml'))) {
  const workflow = read('.github/workflows/batch-evaluate.yml');
  if (workflow.includes('npm ci')) {
    error('.github/workflows/batch-evaluate.yml uses npm ci, but this repo has no lockfile');
  }
  if (workflow.includes('fromJson(')) {
    error('.github/workflows/batch-evaluate.yml uses fromJson; use GitHub Actions fromJSON');
  }
  if (!workflow.includes('copilot-batch-')) {
    warn('.github/workflows/batch-evaluate.yml does not upload Copilot batch artifacts');
  }
  if (!workflow.includes('does not perform AI reasoning')) {
    warn('.github/workflows/batch-evaluate.yml should explicitly document that Actions only collect inputs');
  }
  ok('.github/workflows/batch-evaluate.yml has Copilot batch collection safeguards');
}

if (existsSync(join(ROOT, '.vscode/settings.json'))) {
  try {
    const settings = JSON.parse(read('.vscode/settings.json'));
    if (settings['chat.promptFiles'] !== true) error('.vscode/settings.json should enable chat.promptFiles');
    if (settings['chat.includeApplyingInstructions'] !== true) warn('.vscode/settings.json does not explicitly enable chat.includeApplyingInstructions');
    if (settings['chat.includeReferencedInstructions'] !== true) warn('.vscode/settings.json does not explicitly enable chat.includeReferencedInstructions');
    if (settings['chat.useAgentsMdFile'] !== true) warn('.vscode/settings.json does not explicitly enable chat.useAgentsMdFile');
    ok('.vscode/settings.json parses and enables Copilot workspace prompt support');
  } catch (err) {
    error(`.vscode/settings.json is invalid JSON: ${err.message}`);
  }
}

console.log('\n' + '='.repeat(50));
console.log(`Copilot migration: ${errors} errors, ${warnings} warnings`);

if (errors === 0 && warnings === 0) {
  console.log('Copilot migration layer looks good.');
} else if (errors === 0) {
  console.log('Copilot migration layer is usable with warnings.');
} else {
  console.log('Copilot migration layer needs fixes.');
}

process.exit(errors > 0 ? 1 : 0);
