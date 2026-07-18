# Post-onboarding live progress bar for scan/evaluate re-runs

## Problem

Once a user has completed onboarding, re-running a scan or evaluation from the
dashboard (`LaunchPad`) shows only an indeterminate `Spinner` next to the
button. There's no sense of how far along the run is or how much longer it
will take, which gives the user no reason to stay on the page — exactly the
moment we most want to retain them (they've already seen value once and are
choosing to come back for more).

Onboarding's own scan/evaluate step already has a percentage bar, but it's a
synthetic "goal-gradient" indicator tied to onboarding *gate* completion
(20/40/62/84/100%), not to how far the underlying job has actually
progressed. It doesn't extend to post-onboarding re-runs, and isn't meant to.

## Scope

- Applies **only** to `LaunchPad`'s post-onboarding-complete rendering
  branches (steady state, weak-scan reframe, reveal, and the expanded
  checklist view when `onboarding.complete === true`). Pre-completion runs
  (still inside the guided activation checklist) keep today's plain
  `Spinner` — unchanged.
- Onboarding's own goal-gradient bar (`onboarding-flow.tsx:630-635`) is
  **not** touched or replaced.
- Applies to both `scan:fallback` and `evaluate:all`, the two commands
  `LaunchPad`'s re-run buttons trigger.

## Current architecture (relevant pieces)

- `POST /api/pipeline/[command]` enqueues a `Job` Postgres row and returns
  `{ jobId }` immediately (`prisma/schema.prisma` `model Job`: `status`,
  `log` (`Text`), `exitCode`, `error`, no progress/percent field).
- `src/worker/index.ts` claims queued jobs, spawns the CLI (`scan.ts` /
  `evaluate.ts`) as a child process, and flushes captured stdout into
  `Job.log` every 2s.
- `web/components/pipeline-provider.tsx` POSTs to enqueue, then polls
  `GET /api/pipeline/jobs/:id` every 1.5s until `done`, holding `running` and
  `log` in a shared React context (`usePipeline()`).
- `web/lib/scan-telemetry.ts` parses the plain-text `log` into structured
  numbers (`corpus`, `total`, `relevant`, `shortlist`, `scored`, `topScore`,
  `evaluated`) via regex — this is already the codebase's established
  pattern: *the log is the only progress signal the job API exposes; it's
  parsed client-side rather than adding a structured payload.*
- `evaluate:all` (`src/cli/evaluate.ts`) already logs
  `📋 {targets.length} job(s) queued` up front (a known total), and logs
  `📊 Score: {n}/5` per successfully-scored job — but logs nothing
  equivalent for a skipped (missing URL, dry-run) or errored job, so the
  existing `scored` count under-reports true completions when any items
  skip or error.
- `scan:fallback`'s slow phase is `validateJobUrls` (`src/lib/url-validator.ts`),
  which logs `🕵️ Validating URLs for {jobs.length} relevant jobs` up front
  (a known total) but only logs a line for **invalid** URLs, not valid ones —
  so there's no current per-item "done" signal at all for this loop. Scan's
  other phase (in-memory corpus matching) is effectively instant and has no
  meaningful per-item progress to show.

## Design

### 1. CLI logging additions (the only source-of-truth change)

Add one new, purely-additive log line per completed item in both loops,
using a shared counter incremented synchronously inside each task's
callback (same pattern already used for `results.evaluated` /
`validCount` — safe under Node's single-threaded event loop even with
concurrent tasks, since the completion order doesn't matter, only the count):

- `src/lib/url-validator.ts`: after each job's validation settles (valid or
  invalid), log `📊 Progress: {done}/{total} URLs checked`.
- `src/cli/evaluate.ts`: after each per-job task settles — success, skipped
  (no URL / dry-run), or error — log `📊 Progress: {done}/{total} roles
  evaluated`.

No existing log lines change or move. Both loops already compute `total`
up front (`jobs.length` / `targets.length`), so this is a one-line addition
per loop.

### 2. Telemetry parsing

Extend `web/lib/scan-telemetry.ts`'s `ScanTelemetry` interface with:

```ts
progressDone: number | null;
progressTotal: number | null;
```

Parsed from the **last** `Progress: {done}/{total}` match in the log (a
monotonically increasing counter, so taking the last match is always the
current state). `null` until the first such line appears — e.g. during
scan's instant matching phase, or whenever a shortlist/target list is empty
and the loop body never runs.

### 3. Deriving `percent` in `PipelineProvider`

`PipelineProvider` already holds `log` in state and is consumed everywhere
via `usePipeline()`. Add a derived value (computed once per render from the
existing `log`, no new polling):

```ts
const tel = parseScanTelemetry(log);
const percent = tel.progressTotal
  ? Math.round((tel.progressDone / tel.progressTotal) * 100)
  : null;
const progressLabel = tel.progressTotal
  ? running?.startsWith("evaluate")
    ? `${tel.progressDone} of ${tel.progressTotal} roles evaluated`
    : `${tel.progressDone} of ${tel.progressTotal} URLs checked`
  : null;
```

Exposed on `PipelineContextValue` as `percent: number | null` and
`progressLabel: string | null`. (`running?.startsWith("evaluate")` matches
the existing `commandLabel`/`runningStep` convention already used in
`pipeline-provider.tsx` and `launch-pad.tsx`, rather than an exact-string
match against `"evaluate:all"`.)

Existing telemetry fields (`scored`, `evaluated`, `topScore`, etc.) and
onboarding's own use of them are untouched — `progressDone`/`progressTotal`
are additive fields on the same interface.

### 4. Rendering in `LaunchPad`

Gated on `onboarding.complete === true && running !== null`. While
`percent === null`, render today's `Spinner` exactly as now (no visual
change for the "no telemetry yet" window — same progressive-reveal
principle the onboarding screen already uses for its counters). Once
`percent` is available, render a bar directly beneath the busy button,
reusing the exact bar markup and transition from
`onboarding-flow.tsx:630-635` (`brand-gradient`, `h-1.5 rounded-full`,
700ms ease-out) for visual consistency with the established design
language:

```
[⏳ Scan]  [Evaluate]
▓▓▓▓▓▓▓░░░ 23 of 40 roles evaluated · 58%
```

Near completion (`percent >= 80`), apply the same subtle proximity
treatment onboarding uses (slightly bolder/accented label color) — but
without onboarding's "endowed baseline" trick or intensifying copy ladder,
since this isn't a first-time activation moment. Just the bar, the label,
and a small visual nudge near the end.

## Edge cases

| Case | Behavior |
|---|---|
| No `Progress:` line ever logged (run errors before any item, or 0 items to process) | Stays spinner-only for the run's whole lifetime — no bar. |
| Zero targets (evaluate: nothing pending; scan: empty shortlist) | Loop body never runs, so no `Progress:` line — run completes near-instantly with today's toast, no bar shown. |
| Concurrent completions (evaluate's semaphore=8, scan's `mapLimit`) | Shared counter incremented synchronously per completed task — correct total regardless of completion order. |
| Cancel mid-run | No new behavior; bar disappears when `running` returns to `null`, same as the spinner does today. |
| Page reload mid-run | Handled for free — `PipelineProvider`'s existing reattach effect refetches and re-parses `log` identically, so the bar resumes at the correct percentage. |

## Testing

Neither `web/` (no test runner configured at all) nor `evaluate.ts` /
`url-validator.ts` (require live Playwright/LLM calls) have existing
automated tests. Consistent with that, no new test infrastructure is
introduced. Verification is manual: run `npm run dev`, trigger a
post-onboarding "Scan again" and "Evaluate again", and confirm the bar
appears, updates, and reaches 100% in step with the run's actual
completion and toast. The existing root `npx vitest run` suite and
`npx tsc --noEmit` must stay green — the CLI changes are one-line additions
to already-covered-by-integration-shape loops, not new logic paths.

## Out of scope

- Onboarding's own goal-gradient bar — untouched.
- A structured `progressDone`/`progressTotal` column on the `Job` model
  (Approach A) or worker-side log parsing into structured fields
  (Approach C) — considered and rejected in favor of extending the
  existing client-parsed-log pattern, which needs no schema or
  infrastructure changes.
- Per-item live status lists (e.g. onboarding's `ActivityFeed`) — this is a
  single aggregate bar, not a detailed feed, for the lower-key post-onboarding
  re-run context.
