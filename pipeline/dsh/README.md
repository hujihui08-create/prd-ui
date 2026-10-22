# Project-local dsh profile

This directory holds the pinned DeepSeek Harness profiles used by
`asset:review --runtime dsh`, `agent:run --runtime dsh`,
`intake:run --runtime dsh`, and `visual:review --runtime dsh`.
It never modifies `~/.dsh`; the CLI is pointed at this home with `DSH_HOME`.

## Layout

```text
dsh/
  home/                                 # DSH_HOME (profile definitions are committed)
    profiles/prd-ui-assets/
      package.json                      # pinned bundles + @prd-ui/runtime-dsh
      cordis.yml                        # []
      cordis.patch.yml                  # vision provider, default model, asset plugin
    profiles/prd-ui-agents/
      package.json                      # base + headless + pi-ai; no project plugin
      cordis.yml                        # []
      cordis.patch.yml                  # vision provider, default model, 32768 maxTokens
    profiles/prd-ui-intake/
      package.json                      # same bundles; no project plugin
      cordis.yml                        # []
      cordis.patch.yml                  # vision provider, default model, 65536 maxTokens
    profiles/prd-ui-visual/
      package.json                      # base + headless + pi-ai; no project plugin
      cordis.yml                        # []
      cordis.patch.yml                  # vision provider, 65536 maxTokens, read-only tool surface
```

`node_modules/`, `.credentials.yaml`, `.env`, and logs inside `home/` are gitignored.

## M1 agent profile

`prd-ui-agents` is the profile used by `agent:run --runtime dsh`. It mounts
only `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, and
`@deepseek-ai/dsh-llm-pi-ai`; it does **not** mount the asset-review tool
plugin, so IA / Interaction / Visual Style agents get no project tools.
`maxTokens` is 32768 because `deepseek-flash` can spend the full 8K budget on
reasoning before emitting JSON. The agent runner still uses `--json -` with the
task on stdin and reads `final.text` plus `status(step_end)` usage.

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runtime dsh \
  --runs /tmp/m1-agent-dsh
```

The three-agent smoke run on 2026-10-20 used one call per role, no schema
repair, and cost **¥0.2081** (`usageComplete=true`); see
[`../docs/agent-m1.md`](../docs/agent-m1.md) for the per-role token breakdown.

## Intake profile

`prd-ui-intake` is the profile used by `intake:run --runtime dsh`. It has the
same provider/tool setup as `prd-ui-agents` but raises `maxTokens` to 65536:
the 8-page sample PRD's review JSON exceeds 32768 output tokens. M1 stays on
`prd-ui-agents` (32768).

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --runtime dsh \
  --runs /tmp/intake-dsh
```

Real dsh results (2026-10-20): employee-app 2-page intake completed
(`success`, ¥0.6948); 8-page sample intake completed with three explicit
sample waivers (`success`, ¥0.90666), both `usageComplete=true`.

## Visual critic profile

`prd-ui-visual` is the profile used by `visual:review --runtime dsh`. It has
the same vision provider as `prd-ui-assets` but no project plugin bundle
(`@prd-ui/runtime-dsh` is removed); the base `read_image` tool is enough.
`maxTokens` is 65536: the critic reads and reasons over all 24 screenshots before
emitting the critique JSON, and 32768 output tokens truncated the final answer.
The 24 screenshots plus Page Specs still fit comfortably in the 128K input
window. `visual:review` defaults the critic timeout to 900000ms; real reviews
take roughly 3–6 minutes.

The model-facing tool surface is deliberately reduced:

- kept: `read`, `read_image`, `glob`, `grep`, `skill`, `working_directory`, and
  session-state tools (`todo_write`, goals, job listing/output); `read_image`
  is the screenshot path;
- removed: `write`, `edit`, `bash`, `pwsh`, `workflow`/PTC, subagent tools, and
  `web_search`/`web_fetch`; the sandbox policy is `read-only`.

This is not read confinement: dsh's filesystem sandbox applies the policy only
to mutations, so `read`/`read_image`/`glob`/`grep` can still read any path the
dsh process can read. The critic prompt only lists the run-directory
screenshots, but treat the residual read surface as process-wide.

`--max-cost-cny` (default 3) is enforced from `pricing.json`; incomplete usage
is a blocker.

Real 8-page visual reviews (2026-10-22): the first run timed out at 300s with
32768 maxTokens (¥0.9835, `usageComplete=false`); after raising the profile to
65536 and the default CLI timeout to 900s, the next run produced 12 findings
(¥0.3641); the final run `run-2026-10-22T13-55-24-469Z` produced 9 findings
(6 major / 3 minor / 0 blocker), `usageComplete=true`, ¥0 from the signed
critique cache (0 model calls), 24/24 screenshots, 0 console / 0 overflow,
diff 24/0/0. It was signed per the stopping rule (`waivers=[]`) and is
`status=passed`; the critic verdict remains `changes` and the 6 residual majors
are v0.5 debt. The cache key is visual manifest hash + Page Spec hash +
runtime/profile/model; see the report/artifact README for evidence.

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> \
  --html /tmp/html-v04 \
  --baseline baselines/employee-app-phase2 \
  --runtime dsh \
  --profile prd-ui-visual \
  --runs /tmp/visual-review-dsh
```

Smoke test the profile without a review:

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" \
  ./node_modules/.bin/dsh --profile prd-ui-visual \
  "Return the JSON {\"ok\":true} and nothing else."
```

## Install

The profile is a workspace project, so a single install at `pipeline/` is enough:

```bash
cd pipeline
pnpm install
```

The pinned CLI is `@deepseek-ai/dsh@0.2.1-rc.2` in `pipeline/package.json`.
The profile bundles are pinned to `0.2.1-rc.2` as well.

## Configure the vision model

The Asset Reviewer needs a vision-capable model. `@deepseek-ai/dsh-llm-deepseek`
is text-only and rejects image blocks, so the profile uses
`@deepseek-ai/dsh-llm-pi-ai` with DeepSeek's OpenAI-compatible endpoint. The
default is `https://api.deepseek.com/v1` + `deepseek-flash`; there is no
OpenAI default and no provider fallback.

`.env` is not loaded automatically. Copy the template, fill in a key, and
export the variables:

```bash
cd pipeline
cp .env.example .env
# edit .env:
# PRD_UI_VISION_API_KEY=...
# PRD_UI_VISION_BASE_URL=https://api.deepseek.com/v1
# PRD_UI_VISION_MODEL=deepseek-flash
set -a; . ./.env; set +a
```

The profile's `cordis.patch.yml` reads `PRD_UI_VISION_BASE_URL` and
`PRD_UI_VISION_MODEL` directly from the environment; there is no provider
fallback. `apiKeyEnv: PRD_UI_VISION_API_KEY` names the key variable only; the
value stays in the environment or `pipeline/.env`. `asset:review` fails at
startup with `CONFIGURATION_ERROR` when the base URL or model is missing.
Never commit `.env`.

You can also export the variables in the shell; inherited environment wins over
`$DSH_HOME/.credentials.yaml`.

## Smoke test

The smoke test needs the same provider variables; export them first:

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" \
  ./node_modules/.bin/dsh --profile prd-ui-assets \
  "Return the JSON {\"ok\":true} and nothing else."
```

Without a key the profile loads and the plugin activates, then fails with
`MISSING_CREDENTIAL` naming `PRD_UI_VISION_API_KEY`. That is the expected
"wired but unconfigured" state. With a key, the command prints the model's final
message and exits 0.

## Mock integration test

`pnpm test:dsh` (from `pipeline/`) starts a local OpenAI-compatible mock HTTP
server and runs `asset:review --only icon-home --runtime dsh` through the real
pinned CLI/profile. It asserts exit 0, a passed asset, `dsh/` evidence, and
`summary.usageComplete === true`; no real key or external network is used.

- The mock may return zero or absent cache-read fields: the adapter treats a
  missing `cacheReadTokens` as `0` and still reports `usageComplete === true`.
  Only a completely missing `usage` object is incomplete.
- A missing `node_modules/.bin/dsh` fails the test with an install hint; only
  `SKIP_DSH=1` skips it.
- `pnpm test` excludes this file so the default suite stays offline.

The full `asset:review --runtime dsh` path was verified twice: first against a
local mock endpoint, then against the real DeepSeek API with `deepseek-flash`.
Both runs passed all 13 M0 assets. The real 13-asset run used
79,607 input + 30,043 output + 727,552 cache-read tokens; estimated
**¥0.463 peak / ¥0.232 off-peak**. Including the probe and a failed/rerun pass,
total estimated spend was **≈¥0.78**, below the 10 CNY stop line. The key lives
only in the gitignored `pipeline/.env`.

## Run asset review

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --runtime dsh \
    --runs /tmp/m0-runs-dsh
```

`--runtime dsh` defaults to `--max-review-cost-cny 10`; a run that exceeds it,
or whose usage is incomplete without `--allow-unknown-cost`, exits 1. The core
state machine still owns retries, source fallback, budgets, and the manifest.
dsh only reviews one candidate per attempt. Evidence is written under
`runs/<runId>/dsh/<assetId>-<source>-<attempt>/` (prompt, stdout, stderr,
session metadata, `review.raw.json`, and `error.json` on failure). The canonical
record remains `asset-review.json`; `--json` prints exactly one machine-readable
summary to stdout for review/preflight runs and suppresses the human summary
(help and argument errors are outside that contract).

## Current limitations

- Headless one-shot only; no dsh desktop UX adaptation.
- The task prompt carries the review rubric; the `preset/asset-reviewer` skill is
  the reusable form for later.
- A vision key is required for a real run; `pnpm test:dsh` (local mock) and
  `--runtime standalone` with the scripted reviewer are the keyless paths.
- dsh is still a release candidate; the CLI and bundles are pinned, and `@next`
  is not used.
