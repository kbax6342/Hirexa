# Hirexa Auto-Apply Setup

This document explains how to run Hirexa's Playwright-based auto-apply flow locally.

## Goal
Hirexa's auto-apply flow should stay inside the existing app architecture.
It should use the current `JobApplication` audit/apply routes and Playwright helpers.

This setup does **not** require a separate `openclaw` CLI.

## 1. Install dependencies
From the repository root:

```bash
npm install
```

If your root scripts forward into `my-app`, also make sure app dependencies are installed:

```bash
cd my-app
npm install
cd ..
```

## 2. Environment variables
Use your existing Hirexa app environment values as the source of truth.
At minimum, the app already expects Prisma database connection values:

```bash
DATABASE_URL=
DIRECT_URL=
```

Depending on the parts of Hirexa you are testing locally, you may also need your existing values for auth, AI, email, payments, and job providers.
Do not invent new environment variables unless the implementation truly requires them.

## 3. Prisma
From `my-app`:

```bash
cd my-app
npx prisma generate
```

If you are applying schema changes locally, run your normal migration flow as well:

```bash
npx prisma migrate dev
```

## 4. Install Playwright browser
From `my-app`:

```bash
cd my-app
npx playwright install chromium
```

This is required for the server-side audit/apply helpers that use Playwright.

## 5. Start the app
From the repository root:

```bash
npm run dev
```

## 6. Recommended local test flow
1. Log in to Hirexa.
2. Open a job that can create a `JobApplication` record.
3. Trigger the audit flow.
4. Confirm the audit output identifies live form fields and missing data.
5. Upload a resume if needed.
6. Trigger the apply flow.
7. Confirm one of these outcomes:
   - application submitted successfully
   - verification required
   - clear failure reason

## 7. Notes for hosted environments
- Keep these routes on the Node runtime.
- Browser automation is more reliable when tested locally first.
- If you later run this on hosted infrastructure, confirm the runtime has enough duration and memory for Playwright-based form interaction.
- Avoid adding a second parallel automation stack unless there is a very clear reason.

## 8. Architecture direction
The best direction for Hirexa is:
- keep the current `JobApplication` flow
- strengthen `applyRunner.ts`
- strengthen `auditRunner.ts`
- expand `jobApplicationAudit.ts`
- persist better audit/submission data in existing routes

That gives Hirexa the OpenClaw-style behavior without introducing a separate CLI dependency or a disconnected execution path.
