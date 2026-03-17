# Deployment Readiness

## Deployable App Root

- Primary app path in this workspace: `Hirexa/my-app`
- Current linked Vercel project lives at the app root and uses `rootDirectory: null`

## Recommended Vercel Settings

- Framework Preset: `Next.js`
- Node.js Version: `24.x`
- Install Command: leave blank
- Build Command: leave blank
- Output Directory: leave blank

### Root Directory

- If Vercel is linked directly to the `Hirexa/my-app` repo: leave **Root Directory** blank
- If Vercel is linked to the outer workspace repo at `Hirexa-V1.1.0`: set **Root Directory** to `Hirexa/my-app`

## Validation Completed

- `npm ci`
- `npm run prisma:generate`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npx vercel build`

All of the above passed from `Hirexa/my-app`.

## Prisma Notes

- Database provider: PostgreSQL
- `prisma generate` is required during install/build
- `prisma migrate deploy` should run during production rollout before serving traffic
- Existing script: `npm run db:migrate:deploy`

## Runtime/Config Notes

- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is now optional at runtime; the provider no-ops if it is unset
- Sensitive profile field encryption expects `PROFILE_ENCRYPTION_KEY` and can fall back to `ENCRYPTION_KEY`
- The Smart Matches location fallback path now returns:
  - `requestedState`
  - `resolvedState`
  - `fallbackUsed`
  - `attemptedStates`

## Remaining Follow-Up Items

- Production environment variables still need to be populated from `.env.example`
- Runtime security advisories remain in transitive dependencies:
  - `undici`
  - `dompurify`
  - `underscore`
- Those advisories did not block build or `vercel build`, but they should be addressed in a separate dependency upgrade pass because the safe fix path requires broader upstream package movement than this deployment-hardening pass
