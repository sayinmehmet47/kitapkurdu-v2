# Development, browser evidence, and AI workflow

## Initial setup

Use Node 24, then:

```bash
npm ci
npm run setup:browsers
npm run cf:typegen
npm run db:migrate
```

Normal local authentication needs your own ignored `.env.local` secret as
described in the README. Automated tests generate their own secret; no real
secret, Cloudflare account access, or real user data is required for CI.

The Playwright Test runner and Playwright MCP can depend on different browser
revisions. `setup:browsers` installs both matching Chromium revisions. CI needs
only the test runner's browser and installs its Linux system dependencies too.

## One feature at a time

1. Describe observable acceptance criteria in a GitHub issue.
2. Create a branch from `main`; preserve any unrelated local changes.
3. Ask the agent to implement the feature and a regression test.
4. Run `npm run verify` and inspect the screenshots, not just the exit code.
5. Review the PR diff, test results, and risk notes. A human decides to merge.
6. Deployment is a separate, explicit decision. CI does not deploy on merge; the
   manual Deploy test workflow deploys `main` after the owner approves it.

Example agent request:

> On a new feature branch, implement the requested book-list UI. Add relevant
> browser assertions, run `npm run verify`, inspect desktop/mobile screenshots,
> and report the evidence paths. Do not merge, deploy, change DNS, or touch real data.

`AGENTS.md` limits repair loops and prohibits weakened tests, real-account browser
sessions, automatic screenshot acceptance, and unauthorized remote changes.

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Normal development at http://localhost:3000 |
| `npm run verify` | All quality checks; no deployment |
| `npm run check:write` | Deliberate formatting and safe lint fixes; review the diff |
| `npm test` | Auth/database integration tests with temporary D1 |
| `npm run test:e2e` | All desktop/mobile browser tests |
| `npm run test:e2e -- --project=desktop-chromium` | One browser/device project |
| `npm run test:e2e:ui` | Playwright's interactive test UI |
| `npm run test:e2e:report` | Open the HTML report |
| `npm run dev:e2e` | Keep an isolated inspection app on port 4173 until Ctrl+C |

`verify` checks source formatting/lint, generated Worker types, routes, TypeScript,
auth integration tests, a hosted-target build, and browser tests. Browser tests
also build their own local-only configuration before starting a preview server.
Build output is generated; `deploy:test` always rebuilds the intended target.

## Test isolation

`scripts/e2e-server.mjs` creates a unique `.wrangler/e2e-*` directory, generates a
temporary config and secret, and applies SQL migrations **locally** to a different
D1 identity. Vite does not load normal dotenv files for that test app. Cloudflare
credentials and hosted-environment selection are removed from its process env.
Remote bindings are disabled and the server binds only to 127.0.0.1:4173.

The browser runner refuses to reuse an existing server. Every test gets a new
browser context and synthetic client IP; auth tests use generated accounts.
The E2E server stops after the run and removes only its own temporary state.
Do not delete `.wrangler/state`: that is your normal development database.

The browser fixture blocks third-party requests. The device named
`mobile-chromium` is Chromium mobile emulation, not a physical phone or Safari.

## Screenshots and debugging

- `playwright-report/index.html`: browsable report, including screenshot attachments.
- `test-results/`: full-page screenshots, plus videos and traces for failures.
- CI: open the PR's **Quality checks** run and download **browser-evidence**.
- Use the report's trace attachment to inspect steps, DOM snapshots, and requests.

Successful key screens are captured deliberately with reduced motion and stable
locale/timezone. These are review evidence, not pixel-diff assertions. Introduce
pixel baselines only after reviewing them in a consistent OS/browser/font setup;
do not compare a macOS baseline blindly against Linux CI or auto-accept changes.

Traces can include test passwords, session cookies, and network responses. Only
synthetic accounts are allowed. Evidence and auth state are Git-ignored, not
committed. CI artifacts expire after seven days. This is a public repository:
source, Actions logs, and downloadable test evidence must be safe to share publicly.

## Playwright MCP in OpenCode

Project `opencode.jsonc` registers the local Playwright MCP. Its config uses a
fresh headless Chromium profile and allows requests to local development/test
origins only. Do not attach your personal browser. Origin filtering is useful
defense in depth, not a security sandbox or protection against malicious pages.

Start `npm run dev:e2e` in your terminal, then ask the agent to inspect
http://127.0.0.1:4173. MCP screenshots default to `artifacts/browser/`. The agent
can navigate, inspect accessibility snapshots, take screenshots, and read browser
errors. The committed Playwright suite remains the repeatable acceptance check.

OpenCode normally reloads project configuration; restart it if the tools do not
appear, then inspect `/mcps`. Stop the inspection server with Ctrl+C afterward.

## GitHub and deployment

The repository is public. CI uses read-only repository permissions, pinned action
commits, locked npm dependencies, bounded job time, and short artifact retention.
It uses `pull_request`, not a privileged `pull_request_target` workflow. No
Cloudflare API tokens are available to test jobs. Dependabot proposes reviewed
dependency/action updates; it never auto-merges them.

`main` is protected: changes go through pull requests, **Quality checks** must pass
on an up-to-date branch, and review conversations must be resolved. These rules
also apply to administrators; force pushes and branch deletion are blocked.
No second-person approval is required so the sole maintainer can merge their own
PR after inspecting the diff and evidence. Merging remains a manual decision.

Hosted test remains https://kitapkurdu.kigx.xyz with its existing D1, R2 bucket,
and secrets. Deploy it with the manual **Deploy test** workflow
(`.github/workflows/deploy-test.yml`): it only runs from `main`, waits for the
owner's approval on the `test` environment, then runs quick checks,
`npm run db:migrate:test`, `npm run deploy:test`, and a smoke check. The
environment's `CLOUDFLARE_API_TOKEN` is passed only to the migration and deploy
steps. Do not deploy from a local checkout or worktree, use the default deploy
script, or deploy an E2E build. Worker code rollback does not restore database data.
