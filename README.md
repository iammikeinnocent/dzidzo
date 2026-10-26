# Dzidzo

Offline-first school management platform for Early Childhood Development (ECD)
centres in areas with little or no connectivity — attendance, learner records
and school finance that keep working when the network does not.

> **Dzidzo** is Shona for *education / learning*.

## What it does

- **Offline-first attendance** — daily registers are captured in IndexedDB,
  queued in an outbox and synced idempotently (`SYNC#<id>` acks per tenant,
  last-write-wins merges). Unsynced marks overlay server state with a
  "queued" badge until the engine confirms them.
- **Learner & guardian management** — enrolment, class rosters via a
  single-table GSI, guardians linked to learners with E.164 phone targeting.
- **Finance (online-only)** — staff salaries, monthly payroll runs
  through a configurable Zimbabwe PAYE/NSSA/AIDS-levy rule engine, expenses,
  fee payments and a month P&L summary.
- **Daily absenteeism SMS** — an EventBridge-scheduled job walks the tenant
  registry, finds explicitly-absent learners and notifies their guardians via
  Africa's Talking (sandbox/mock providers behind one interface).
- **Security** — Cognito hosted-UI login (authorization code + PKCE), a
  pre-token-generation Lambda stamping `custom:tenant_id` + `custom:role`
  (failing closed on provisioning errors), a JWKS verifier enforcing issuer
  and per-token-kind audience contracts, and one permission matrix
  (teacher/manager/director) enforced server-side and mirrored in the UI.

## Stack

| Layer | Technology |
|---|---|
| Web app | React + TypeScript + Vite + Tailwind (PWA) · Dexie.js offline store |
| Sync | `@dzidzo/sync` engine — bounded idempotent batches, per-item results |
| API | Node.js + TypeScript + Hono on AWS Lambda (ARM_64, minified) |
| Auth | Cognito user pools + groups + pre-token claims Lambda · jose JWKS |
| Data | DynamoDB single-table design + 2 GSIs, schema shared by CDK and code |
| Jobs | EventBridge rule → absenteeism Lambda → Africa's Talking SMS |
| Hosting | S3 + CloudFront (OAI, SPA rewrites) |
| IaC | AWS CDK v2 — data, auth, api, jobs, site, cicd (GitHub OIDC) |
| Tooling | pnpm workspaces · Vitest · ESLint · GitHub Actions CI/CD |

## Repository layout

```
dzidzo/
  apps/web/           React PWA + offline layer
  services/api/       Lambda handlers (Hono) + data layer + sync apply
  services/auth-lambda/  pre-token-generation claims handler
  services/jobs/      absenteeism SMS job + SMS providers
  packages/core/      shared types, permission matrix, validation, PAYE engine
  packages/sync/      client sync engine (outbox stores, drain protocol)
  infra/              CDK stacks (data, auth, api, jobs, site, cicd)
```

## Getting started

```bash
pnpm install

pnpm dev          # web app (apps/web) — shows a setup notice until configured
pnpm test         # all unit + integration tests
pnpm lint         # eslint across the monorepo
pnpm typecheck    # tsc in every package
pnpm synth        # synth the CDK stacks (no AWS credentials needed)

docker compose up -d   # DynamoDB Local on :8000 (integration tests use it)
```

After deploying the dev stacks, copy `apps/web/.env.example` to
`apps/web/.env.local` and fill the three values from the CDK outputs.

## Roles & permissions

| Capability | Teacher | Manager | Director |
|---|---|---|---|
| Attendance / assessments | ✅ | ✅ | ✅ |
| Enrolment, guardians, classes | ❌ | ✅ | ✅ |
| Reports & dashboards | own class | ✅ | ✅ |
| Finance read | ❌ | ✅ | ✅ |
| Finance write | ❌ | ❌ | ✅ |
| User & role management | ❌ | ❌ | ✅ |

The matrix lives in [`packages/core/src/permissions.ts`](packages/core/src/permissions.ts)
and is enforced by API middleware — the UI gating is cosmetic only.

## Deployment

```bash
pnpm --filter @dzidzo/infra bootstrap       # once per AWS account/profile
pnpm --filter @dzidzo/infra deploy:dev      # deploys all six stacks
pnpm --filter @dzidzo/infra destroy:dev     # teardown (dev only)
```

CI deploys from `main` via GitHub OIDC (no static keys): create the repo,
set the `githubOwner` context, then add the role ARN (a stack output) as the
`DEPLOY_ROLE_ARN` repository variable.