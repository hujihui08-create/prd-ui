# Project-local dsh profile

This directory holds the pinned DeepSeek Harness profile used by `asset:review --runtime dsh`.
It never modifies `~/.dsh`; the CLI is pointed at this home with `DSH_HOME`.

## Layout

```text
dsh/
  home/                                 # DSH_HOME (profile definition is committed)
    profiles/prd-ui-assets/
      package.json                      # pinned bundles + @prd-ui/runtime-dsh
      cordis.yml                        # []
      cordis.patch.yml                  # vision provider, default model, asset plugin
```

`node_modules/`, `.credentials.yaml`, `.env`, and logs inside `home/` are gitignored.

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

- The mock must return non-zero `prompt_tokens_details.cached_tokens`: dsh omits
  `cacheReadTokens` when it is zero, and the adapter then reports usage as
  incomplete.
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
