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
`@deepseek-ai/dsh-llm-pi-ai` with an OpenAI-compatible route.

Copy the template and fill in a key:

```bash
cd pipeline
cp .env.example .env
# edit .env:
# PRD_UI_VISION_API_KEY=...
# PRD_UI_VISION_BASE_URL=https://api.openai.com/v1
# PRD_UI_VISION_MODEL=gpt-4o-mini
```

The profile's `cordis.patch.yml` only references the key name
(`apiKeyEnv: PRD_UI_VISION_API_KEY`); the value stays in the environment or
`pipeline/.env`. Never commit `.env`.

You can also export the variables in the shell; inherited environment wins over
`$DSH_HOME/.credentials.yaml`.

## Smoke test

```bash
cd pipeline
DSH_HOME="$PWD/dsh/home" \
  ./node_modules/.bin/dsh --profile prd-ui-assets \
  "Return the JSON {\"ok\":true} and nothing else."
```

Without a key the profile loads and the plugin activates, then fails with
`MISSING_CREDENTIAL` naming `PRD_UI_VISION_API_KEY`. That is the expected
"wired but unconfigured" state. With a key, the command prints the model's final
message and exits 0.

The full `asset:review --runtime dsh` path was also verified against a local
mock OpenAI-compatible endpoint: one icon smoke passed, then all 13 M0 assets
passed. A real provider key is still required to measure visual quality/cost.

## Run asset review

```bash
cd pipeline
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime dsh \
  --runs /tmp/m0-runs-dsh
```

The core state machine still owns retries, source fallback, budgets, and the
manifest. dsh only reviews one candidate per attempt. Evidence is written under
`runs/<runId>/dsh/<assetId>-<source>-<attempt>/` (prompt, stdout, stderr,
session metadata). The canonical record remains `asset-review.json`.

## Current limitations

- Headless one-shot only; no dsh desktop UX adaptation.
- The task prompt carries the review rubric; the `preset/asset-reviewer` skill is
  the reusable form for later.
- A vision key is required for a real run; `--runtime standalone` with the
  scripted reviewer is the keyless CI path.
- dsh is still a release candidate; the CLI and bundles are pinned, and `@next`
  is not used.
