# Post-Onboarding Progress Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a real, item-level percentage progress bar (instead of an indeterminate spinner) when a user who has already completed onboarding re-runs a scan or evaluation from the dashboard.

**Architecture:** Add one additive "done/total" log line to each of the two per-item loops that currently lack one (`url-validator.ts`, `evaluate.ts`), parse the last such line client-side via an extension to the existing `scan-telemetry.ts` regex parser, derive a `percent`/`progressLabel` pair once in the already-shared `PipelineProvider` context, and render a bar (reusing onboarding's existing `brand-gradient` bar markup) in `LaunchPad`, gated strictly on `onboarding.complete === true`.

**Tech Stack:** TypeScript, Next.js/React (web/), Node CLI scripts (src/cli, src/lib), no new dependencies.

## Global Constraints

- Bar only renders when `onboarding.complete === true` (per approved spec) — pre-completion runs keep today's plain `Spinner`, unchanged.
- Onboarding's own goal-gradient bar (`onboarding-flow.tsx:630-635`) is not touched.
- No schema/DB changes, no new polling — the existing 1.5s `/api/pipeline/jobs/:id` poll and its `log` payload are the only data source.
- No new test infrastructure — `web/` has no test runner configured and `evaluate.ts`/`url-validator.ts` require live Playwright/LLM calls; verification is `npm run typecheck` / `npm run build` / `npx tsc --noEmit` / `npx vitest run` (root) plus a final manual browser check.
- Full spec: `docs/superpowers/specs/2026-07-18-post-onboarding-progress-bar-design.md`.

---

### Task 1: Per-item progress log line in `url-validator.ts`

**Files:**
- Modify: `src/lib/url-validator.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: a new log line `📊 Progress: {done}/{total} URLs checked`, emitted exactly once per job processed by `validateJobUrls`, `total` fixed at `jobs.length`. Task 3 depends on this exact line format (`Progress:\s*(\d+)\/(\d+)`) appearing in the CLI's captured stdout.

- [ ] **Step 1: Add a shared counter and log line after each job settles**

Current code (inside `validateJobUrls`, right after the `let validCount = 0; let invalidCount = 0;` declarations and inside the `mapLimit` callback, right after the existing valid/invalid branch and before the `return { job, isValid };` line):

```ts
  let validCount = 0;
  let invalidCount = 0;
```

Replace with:

```ts
  let validCount = 0;
  let invalidCount = 0;
  let done = 0;
  const total = jobs.length;
```

Then find this block inside the `mapLimit` callback:

```ts
      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
        log.info(`   ❌ Invalid URL stripped: ${job.company} - ${job.title} (${reason})`);
      }
      
      return { job, isValid };
```

Replace with:

```ts
      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
        log.info(`   ❌ Invalid URL stripped: ${job.company} - ${job.title} (${reason})`);
      }

      done++;
      log.info(`   📊 Progress: ${done}/${total} URLs checked`);

      return { job, isValid };
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` (from the repo root)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/url-validator.ts
git commit -m "feat: log per-item progress in URL validation for live progress bars"
```

---

### Task 2: Per-item progress log line in `evaluate.ts`

**Files:**
- Modify: `src/cli/evaluate.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: a new log line `📊 Progress: {completed}/{targets.length} roles evaluated`, emitted exactly once per job task regardless of outcome (success, skipped for missing URL, skipped for dry-run, or error). Task 3 depends on this exact line format.

- [ ] **Step 1: Wrap the per-job task body in try/finally and add a shared counter**

Current code:

```ts
  const browser = await chromium.launch({ headless: true });
  const date = today();
  const results = { evaluated: 0, skipped: 0, errors: 0 };

  const sem = createSemaphore(concurrency);

  try {
    await Promise.all(
      targets.map((job) =>
        sem(async () => {
          const tag = `[#${job.num}]`;
          log.rule();
          log.info(`${tag} ${job.company} — ${job.role}`);

          const url = job.url;

          if (!url) {
            log.warn(`${tag} ⚠️  No URL in scan results — skipping. Re-run scan or use --job N.`);
            results.skipped += 1;
            return;
          }
```

Replace with:

```ts
  const browser = await chromium.launch({ headless: true });
  const date = today();
  const results = { evaluated: 0, skipped: 0, errors: 0 };
  let completed = 0;

  const sem = createSemaphore(concurrency);

  try {
    await Promise.all(
      targets.map((job) =>
        sem(async () => {
          try {
          const tag = `[#${job.num}]`;
          log.rule();
          log.info(`${tag} ${job.company} — ${job.role}`);

          const url = job.url;

          if (!url) {
            log.warn(`${tag} ⚠️  No URL in scan results — skipping. Re-run scan or use --job N.`);
            results.skipped += 1;
            return;
          }
```

- [ ] **Step 2: Close the wrapping try/finally at the end of the same callback**

Current code (the end of the same `sem(async () => { ... })` callback, right before its closing `}),`):

```ts
            results.evaluated += 1;
          } catch (err) {
            log.info(`${tag} ❌ Failed to save report/tracker: ${(err as Error).message}`);
            results.errors += 1;
          }
        }),
      ),
    );
  } finally {
    await browser.close();
  }
```

Replace with:

```ts
            results.evaluated += 1;
          } catch (err) {
            log.info(`${tag} ❌ Failed to save report/tracker: ${(err as Error).message}`);
            results.errors += 1;
          }
          } finally {
            completed += 1;
            log.info(`📊 Progress: ${completed}/${targets.length} roles evaluated`);
          }
        }),
      ),
    );
  } finally {
    await browser.close();
  }
```

This guarantees the progress line fires exactly once per task on every exit path (the early `!url` return, the early dry-run return, the LLM-call-error return, and the final success/save-error fallthrough) without duplicating the log line at each branch.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit` (from the repo root)
Expected: no errors.

- [ ] **Step 4: Reformat with the project's prettier config**

The manual patch above intentionally leaves the newly wrapped block
under-indented — fix it with the repo's configured prettier (`.prettierrc.json`)
rather than hand-indenting.

Run: `npx prettier --write src/cli/evaluate.ts`
Expected: `git diff src/cli/evaluate.ts` shows consistent indentation for the
whole `try { ... } finally { ... }`-wrapped block, with no logic changes.

- [ ] **Step 5: Commit**

```bash
git add src/cli/evaluate.ts
git commit -m "feat: log per-item progress in evaluate for live progress bars"
```

---

### Task 3: Parse the new progress line in `scan-telemetry.ts`

**Files:**
- Modify: `web/lib/scan-telemetry.ts`

**Interfaces:**
- Consumes: log lines produced by Tasks 1–2 (`📊 Progress: {done}/{total} ...`).
- Produces: two new fields on `ScanTelemetry`: `progressDone: number | null`, `progressTotal: number | null`. Task 4 (`PipelineProvider`) consumes these two fields by name.

- [ ] **Step 1: Add the two new fields to the interface**

Current code:

```ts
export interface ScanTelemetry {
  /** Active postings in the corpus the scan matched against. */
  corpus: number | null;
  /** Total postings considered this run. */
  total: number | null;
  /** Postings that passed relevance filtering. */
  relevant: number | null;
  /** High-signal shortlist size. */
  shortlist: number | null;
  /** How many roles have been scored so far (counted `Score: n/5` lines). */
  scored: number;
  /** Highest score seen so far, or null before any score lands. */
  topScore: number | null;
  /** Final evaluated count from the summary line, once printed. */
  evaluated: number | null;
}
```

Replace with:

```ts
export interface ScanTelemetry {
  /** Active postings in the corpus the scan matched against. */
  corpus: number | null;
  /** Total postings considered this run. */
  total: number | null;
  /** Postings that passed relevance filtering. */
  relevant: number | null;
  /** High-signal shortlist size. */
  shortlist: number | null;
  /** How many roles have been scored so far (counted `Score: n/5` lines). */
  scored: number;
  /** Highest score seen so far, or null before any score lands. */
  topScore: number | null;
  /** Final evaluated count from the summary line, once printed. */
  evaluated: number | null;
  /**
   * Items completed so far in the run's slow per-item phase (scan's URL
   * validation, or evaluate's per-job loop), from the last `Progress:
   * n/total` line. Null before any such line has appeared (e.g. during
   * scan's instant matching phase, or when there's nothing to process).
   */
  progressDone: number | null;
  /** The denominator for `progressDone`. Null under the same conditions. */
  progressTotal: number | null;
}
```

- [ ] **Step 2: Initialize the two new fields in the default object**

Current code:

```ts
  const t: ScanTelemetry = {
    corpus: null,
    total: null,
    relevant: null,
    shortlist: null,
    scored: 0,
    topScore: null,
    evaluated: null,
  };
  if (!log) return t;
```

Replace with:

```ts
  const t: ScanTelemetry = {
    corpus: null,
    total: null,
    relevant: null,
    shortlist: null,
    scored: 0,
    topScore: null,
    evaluated: null,
    progressDone: null,
    progressTotal: null,
  };
  if (!log) return t;
```

- [ ] **Step 3: Parse the last `Progress: n/total` match**

Current code (the end of the function, right before `return t;`):

```ts
  const summary = log.match(/(\d+)\s+evaluated\s+(\d+)\s+skipped\s+(\d+)\s+errors/);
  if (summary) t.evaluated = Number(summary[1]);

  return t;
}
```

Replace with:

```ts
  const summary = log.match(/(\d+)\s+evaluated\s+(\d+)\s+skipped\s+(\d+)\s+errors/);
  if (summary) t.evaluated = Number(summary[1]);

  const progressMatches = [...log.matchAll(/Progress:\s*(\d+)\/(\d+)/g)];
  if (progressMatches.length) {
    const last = progressMatches[progressMatches.length - 1] as RegExpMatchArray;
    t.progressDone = Number(last[1]);
    t.progressTotal = Number(last[2]);
  }

  return t;
}
```

- [ ] **Step 4: Manually verify the parser against sample log strings**

This file has no existing test suite (per the approved spec, no new test infrastructure is being introduced), so verify with a throwaway script instead of a permanent test file.

Create `/tmp/verify-telemetry.mjs`:

```js
import { parseScanTelemetry } from "/Users/preethamnimmagadda/Desktop/CarrerOps/web/lib/scan-telemetry.ts";
```

This won't run directly under plain Node (the file is TypeScript). Instead, run it through `tsx` from the `web/` directory:

Create `web/__verify-telemetry.ts`:

```ts
import { parseScanTelemetry } from "./lib/scan-telemetry";

const log1 = "🕵️  Validating URLs for 18 relevant jobs (concurrency=3)...\n   📊 Progress: 1/18 URLs checked\n   📊 Progress: 2/18 URLs checked\n";
const t1 = parseScanTelemetry(log1);
console.log("mid-run:", JSON.stringify({ progressDone: t1.progressDone, progressTotal: t1.progressTotal }));
if (t1.progressDone !== 2 || t1.progressTotal !== 18) throw new Error("FAIL: mid-run parse");

const log2 = "📋 5 job(s) queued:\n📊 Progress: 1/5 roles evaluated\n📊 Progress: 2/5 roles evaluated\n📊 Progress: 3/5 roles evaluated\n📊 Progress: 4/5 roles evaluated\n📊 Progress: 5/5 roles evaluated\n";
const t2 = parseScanTelemetry(log2);
console.log("done:", JSON.stringify({ progressDone: t2.progressDone, progressTotal: t2.progressTotal }));
if (t2.progressDone !== 5 || t2.progressTotal !== 5) throw new Error("FAIL: done parse");

const log3 = "📚 Matching against 200 active postings\n";
const t3 = parseScanTelemetry(log3);
console.log("no-progress-yet:", JSON.stringify({ progressDone: t3.progressDone, progressTotal: t3.progressTotal }));
if (t3.progressDone !== null || t3.progressTotal !== null) throw new Error("FAIL: no-progress-yet parse");

console.log("ALL PASS");
```

Run: `cd web && npx tsx __verify-telemetry.ts`
Expected output:
```
mid-run: {"progressDone":2,"progressTotal":18}
done: {"progressDone":5,"progressTotal":5}
no-progress-yet: {"progressDone":null,"progressTotal":null}
ALL PASS
```

Then delete the throwaway file: `rm web/__verify-telemetry.ts`

- [ ] **Step 5: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/scan-telemetry.ts
git commit -m "feat: parse per-item progress lines into ScanTelemetry"
```

---

### Task 4: Derive `percent`/`progressLabel` in `PipelineProvider`

**Files:**
- Modify: `web/components/pipeline-provider.tsx`

**Interfaces:**
- Consumes: `parseScanTelemetry` from `@/lib/scan-telemetry` (Task 3's `progressDone`/`progressTotal` fields).
- Produces: two new fields on `PipelineContextValue` returned by `usePipeline()`: `percent: number | null`, `progressLabel: string | null`. Task 5 (`LaunchPad`/`dashboard.tsx`) consumes these two fields by name.

- [ ] **Step 1: Import the telemetry parser**

Current code (top of file, after the existing imports):

```ts
import { useToast } from "@/components/ui/toast";
import type { PipelineCommand } from "@/lib/pipeline";
```

Replace with:

```ts
import { useToast } from "@/components/ui/toast";
import { parseScanTelemetry } from "@/lib/scan-telemetry";
import type { PipelineCommand } from "@/lib/pipeline";
```

- [ ] **Step 2: Add the two new fields to the context interface**

Current code:

```ts
interface PipelineContextValue {
  /** The command currently running, or null when idle. */
  running: PipelineCommand | null;
  /** Captured console output for the latest run (drives progress telemetry). */
  log: string;
  /** Start a pipeline command. No-ops while another run is in flight. */
  run: (command: PipelineCommand, opts?: RunOptions) => void;
  /** Request cancellation of the in-flight run. */
  cancel: () => void;
  /** Re-open the docked console — retained for API compatibility; no-op now. */
  openConsole: () => void;
  hasLog: boolean;
}
```

Replace with:

```ts
interface PipelineContextValue {
  /** The command currently running, or null when idle. */
  running: PipelineCommand | null;
  /** Captured console output for the latest run (drives progress telemetry). */
  log: string;
  /** Start a pipeline command. No-ops while another run is in flight. */
  run: (command: PipelineCommand, opts?: RunOptions) => void;
  /** Request cancellation of the in-flight run. */
  cancel: () => void;
  /** Re-open the docked console — retained for API compatibility; no-op now. */
  openConsole: () => void;
  hasLog: boolean;
  /** 0–100, derived from the run's last `Progress: n/total` log line — null
   * until that line has appeared (e.g. during scan's instant matching
   * phase, or when there's nothing to process). */
  percent: number | null;
  /** Human-readable counter to pair with `percent`, e.g. "23 of 40 roles
   * evaluated". Null under the same conditions as `percent`. */
  progressLabel: string | null;
}
```

- [ ] **Step 3: Compute the two fields in the existing `value` memo**

Current code (near the end of `PipelineProvider`):

```ts
  const value = React.useMemo<PipelineContextValue>(
    () => ({ running, log, run, cancel, openConsole: () => {}, hasLog: log.length > 0 }),
    [running, log, run, cancel],
  );
```

Replace with:

```ts
  const value = React.useMemo<PipelineContextValue>(() => {
    const tel = parseScanTelemetry(log);
    const percent =
      tel.progressTotal && tel.progressDone !== null
        ? Math.round((tel.progressDone / tel.progressTotal) * 100)
        : null;
    const progressLabel =
      tel.progressTotal && tel.progressDone !== null
        ? running?.startsWith("evaluate")
          ? `${tel.progressDone} of ${tel.progressTotal} roles evaluated`
          : `${tel.progressDone} of ${tel.progressTotal} URLs checked`
        : null;
    return {
      running,
      log,
      run,
      cancel,
      openConsole: () => {},
      hasLog: log.length > 0,
      percent,
      progressLabel,
    };
  }, [running, log, run, cancel]);
```

- [ ] **Step 4: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/components/pipeline-provider.tsx
git commit -m "feat: derive live percent/progressLabel in PipelineProvider"
```

---

### Task 5: Render the progress bar in `LaunchPad`

**Files:**
- Modify: `web/components/dashboard.tsx`
- Modify: `web/components/launch-pad.tsx`

**Interfaces:**
- Consumes: `percent: number | null` and `progressLabel: string | null` from `usePipeline()` (Task 4).
- Produces: visible UI only — no further consumers.

- [ ] **Step 1: Pass `percent`/`progressLabel` from `dashboard.tsx` into `LaunchPad`**

Current code (`web/components/dashboard.tsx:70`):

```ts
  const { run, running } = usePipeline();
```

Replace with:

```ts
  const { run, running, percent, progressLabel } = usePipeline();
```

Current code (`web/components/dashboard.tsx:271-277`):

```tsx
      <LaunchPad
        onboarding={onboarding}
        loading={loading && onboarding === null}
        running={running}
        onOpenKeywords={() => setKeywordsOpen(true)}
        onRun={launchRun}
      />
```

Replace with:

```tsx
      <LaunchPad
        onboarding={onboarding}
        loading={loading && onboarding === null}
        running={running}
        percent={percent}
        progressLabel={progressLabel}
        onOpenKeywords={() => setKeywordsOpen(true)}
        onRun={launchRun}
      />
```

- [ ] **Step 2: Extend `LaunchPadProps`**

Current code (`web/components/launch-pad.tsx:32-39`):

```ts
interface LaunchPadProps {
  onboarding: OnboardingState | null;
  loading: boolean;
  /** The pipeline command currently running, if any. */
  running: PipelineCommand | null;
  onOpenKeywords: () => void;
  onRun: (command: PipelineCommand) => void;
}
```

Replace with:

```ts
interface LaunchPadProps {
  onboarding: OnboardingState | null;
  loading: boolean;
  /** The pipeline command currently running, if any. */
  running: PipelineCommand | null;
  /** 0–100 live progress for the current run, or null before telemetry
   * exists. Only ever rendered when `onboarding.complete` — pre-completion
   * runs keep the plain spinner. */
  percent: number | null;
  progressLabel: string | null;
  onOpenKeywords: () => void;
  onRun: (command: PipelineCommand) => void;
}
```

- [ ] **Step 3: Add the shared `RunProgress` bar component**

Current code (`web/components/launch-pad.tsx`, right after the `runningStep` function and before the `interface StepView` block):

```ts
/** Which step a running pipeline command belongs to. */
function runningStep(running: PipelineCommand | null): OnboardingStep | null {
  if (!running) return null;
  if (running === "scan" || running === "scan:fallback") return "scan";
  if (running.startsWith("evaluate")) return "evaluate";
  return null;
}

interface StepView {
```

Replace with:

```ts
/** Which step a running pipeline command belongs to. */
function runningStep(running: PipelineCommand | null): OnboardingStep | null {
  if (!running) return null;
  if (running === "scan" || running === "scan:fallback") return "scan";
  if (running.startsWith("evaluate")) return "evaluate";
  return null;
}

/**
 * Live percent bar for a post-onboarding re-run, reusing the same
 * brand-gradient bar onboarding's goal-gradient bar uses
 * (onboarding-flow.tsx:630-635) for visual consistency. Self-suppresses
 * (renders nothing) until real per-item telemetry exists, so callers don't
 * need their own null-guards beyond "is something running".
 */
function RunProgress({
  percent,
  progressLabel,
}: {
  percent: number | null;
  progressLabel: string | null;
}) {
  if (percent === null || progressLabel === null) return null;
  return (
    <div className="mt-1.5 max-w-[220px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="brand-gradient h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[0.68rem] text-muted-foreground",
          percent >= 80 && "font-medium text-primary",
        )}
      >
        {progressLabel} · {percent}%
      </p>
    </div>
  );
}

interface StepView {
```

- [ ] **Step 4: Update the component signature to accept the two new props**

Current code (`web/components/launch-pad.tsx:272`):

```tsx
export function LaunchPad({ onboarding, loading, running, onOpenKeywords, onRun }: LaunchPadProps) {
```

Replace with:

```tsx
export function LaunchPad({
  onboarding,
  loading,
  running,
  percent,
  progressLabel,
  onOpenKeywords,
  onRun,
}: LaunchPadProps) {
```

- [ ] **Step 5: Render the bar in the weak-scan reframe branch (`strong === 0`)**

Current code (`web/components/launch-pad.tsx`, inside the `if (strong === 0) { return ( ... ) }` block):

```tsx
            <Button variant="outline" size="sm" onClick={() => onRun("scan:fallback")} disabled={busyAny}>
              {runningStep(running) === "scan" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
              Scan again
            </Button>
          </div>
        </Card>
      );
    }
```

Replace with:

```tsx
            <Button variant="outline" size="sm" onClick={() => onRun("scan:fallback")} disabled={busyAny}>
              {runningStep(running) === "scan" ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
              Scan again
            </Button>
          </div>
          <RunProgress percent={percent} progressLabel={progressLabel} />
        </Card>
      );
    }
```

- [ ] **Step 6: Render the bar in the steady-state branch**

Current code (`web/components/launch-pad.tsx`, the final `return` of the `if (onboarding.complete && !open)` block):

```tsx
    // Steady state: everything's set up → slim status strip.
    return (
      <Card className="flex animate-fade-in-up flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ctp-green/20">
            <CheckCircle2 className="h-5 w-5 text-ctp-green" />
          </span>
          <div>
            <p className="text-sm font-semibold">You&apos;re all set</p>
            <p className="text-xs text-muted-foreground">
              {onboarding.scan.count} roles · {onboarding.evaluate.count} scored · re-run anytime
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onRun("scan:fallback")} disabled={busyAny}>
            {runningStep(running) === "scan" ? <Spinner className="h-3.5 w-3.5" /> : <Radar className="h-3.5 w-3.5" />}
            Scan
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRun("evaluate:all")} disabled={busyAny}>
            {runningStep(running) === "evaluate" ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            Evaluate
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenKeywords}>
            <Tags className="h-3.5 w-3.5" /> Keywords
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Show setup steps">
            <ChevronDown className="h-4 w-4" /> Steps
          </Button>
        </div>
      </Card>
    );
  }
```

Replace with:

```tsx
    // Steady state: everything's set up → slim status strip.
    return (
      <Card className="animate-fade-in-up p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ctp-green/20">
              <CheckCircle2 className="h-5 w-5 text-ctp-green" />
            </span>
            <div>
              <p className="text-sm font-semibold">You&apos;re all set</p>
              <p className="text-xs text-muted-foreground">
                {onboarding.scan.count} roles · {onboarding.evaluate.count} scored · re-run anytime
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onRun("scan:fallback")} disabled={busyAny}>
              {runningStep(running) === "scan" ? <Spinner className="h-3.5 w-3.5" /> : <Radar className="h-3.5 w-3.5" />}
              Scan
            </Button>
            <Button variant="outline" size="sm" onClick={() => onRun("evaluate:all")} disabled={busyAny}>
              {runningStep(running) === "evaluate" ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              Evaluate
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenKeywords}>
              <Tags className="h-3.5 w-3.5" /> Keywords
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Show setup steps">
              <ChevronDown className="h-4 w-4" /> Steps
            </Button>
          </div>
        </div>
        <RunProgress percent={percent} progressLabel={progressLabel} />
      </Card>
    );
  }
```

- [ ] **Step 7: Render the bar in the expanded checklist view, gated on `onboarding.complete`**

Current code (`web/components/launch-pad.tsx:488-497`, inside the `steps.map(...)` block):

```tsx
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{COPY[step.key].title}</span>
                    {step.summary && <span className="text-xs text-ctp-green">{step.summary}</span>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {step.status === "locked" ? step.lockedReason : COPY[step.key].help}
                  </p>
                </div>
              </div>
```

Replace with:

```tsx
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{COPY[step.key].title}</span>
                    {step.summary && <span className="text-xs text-ctp-green">{step.summary}</span>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {step.status === "locked" ? step.lockedReason : COPY[step.key].help}
                  </p>
                  {onboarding.complete && step.busy && (
                    <RunProgress percent={percent} progressLabel={progressLabel} />
                  )}
                </div>
              </div>
```

(Note the anchor now includes the closing `</div>` for the outer `flex min-w-0 flex-1 items-center gap-2` wrapper at `launch-pad.tsx:497`, so the match is unambiguous — that line is unchanged, just included for context.)

- [ ] **Step 8: Typecheck**

Run: `cd web && npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Build**

Run: `cd web && npm run build`
Expected: build succeeds with no new errors or warnings introduced by these files.

- [ ] **Step 10: Commit**

```bash
git add web/components/dashboard.tsx web/components/launch-pad.tsx
git commit -m "feat: show live progress bar for post-onboarding scan/evaluate re-runs"
```

---

### Task 6: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Confirm the full root test suite and build are still green**

Run: `npx vitest run` (from repo root)
Expected: all existing tests pass (this plan didn't add or remove any root test files, so the count should be unchanged from before this plan).

Run: `npm run build` (from repo root)
Expected: succeeds.

- [ ] **Step 2: Start the dev server**

Run: `cd web && npm run dev`
Expected: server starts on its usual port (check terminal output for the exact URL, typically `http://localhost:3000`).

- [ ] **Step 3: Drive a real post-onboarding evaluate run and observe the bar**

In a browser, sign in as a user who has already completed onboarding (`onboarding.complete === true` — has a profile, keywords, at least one scanned role). From the dashboard's `LaunchPad` steady-state strip, click **Evaluate**.

Expected:
- The button shows a spinner briefly (before any `Progress:` line has arrived).
- Within a few seconds, a bar appears below the button row showing `brand-gradient` fill and a label like "1 of 3 roles evaluated · 33%", updating every ~1.5s as the poll refreshes.
- The bar reaches "N of N · 100%" right before the success toast ("Evaluation complete") fires and the bar disappears.

- [ ] **Step 4: Drive a real post-onboarding scan run and observe the bar**

From the same steady-state strip, click **Scan**.

Expected:
- If the resulting shortlist is non-empty, a bar appears with a label like "4 of 9 URLs checked · 44%", the same way as evaluate.
- If the shortlist is empty (no roles cleared the relevance/high-signal bar), the run completes near-instantly with just the spinner and a toast — no bar, which is correct per the spec's "zero targets" edge case.

- [ ] **Step 5: Confirm pre-completion runs are unaffected**

Using a fresh/incomplete-onboarding account (or by temporarily viewing the expanded checklist for an account where `onboarding.complete` is false), trigger a scan or evaluate step from the guided checklist.

Expected: only the existing plain `Spinner` appears — no progress bar, confirming the `onboarding.complete` gate is working as scoped.

- [ ] **Step 6: Stop the dev server**

Stop the `npm run dev` process (Ctrl-C or kill the background task).
