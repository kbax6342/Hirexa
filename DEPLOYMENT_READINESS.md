# Deployment Readiness

## Recommended Vercel Settings

- Framework Preset: `Next.js`
- Root Directory: `my-app` when deploying the parent `Hirexa` repo
- Install Command: leave blank
- Build Command: leave blank
- Output Directory: leave blank
- Node.js Version: `24.x` (validated locally on Node `24.11.1`)

## Validation Completed

- `npm ci`
- `npm exec -- prisma generate`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Parent wrapper build from `Hirexa/`
- Clean-room install/build in a temp copy

## Prisma Notes

- Database provider: PostgreSQL
- Required at install/build time: `prisma generate`
- Required before or during production rollout: `prisma migrate deploy`
- Script added: `npm run db:migrate:deploy`

## External Requirements

- Populate production environment variables from [`.env.example`](./.env.example)
- `vercel build` locally still needs pulled project settings from Vercel (`vercel pull --yes`)
- Google, LinkedIn, Stripe, SendGrid, Adzuna, OpenAI, Anthropic, Maps, reCAPTCHA, Dropbox, and Google Drive features all need their corresponding provider credentials if those features should be enabled in production
