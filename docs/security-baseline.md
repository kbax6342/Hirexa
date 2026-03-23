# Hirexa Security Baseline

This document describes the current practical security baseline implemented in
the Hirexa application codebase. It is intentionally specific and does not make
broader compliance or certification claims.

## Platform baseline

- Hirexa is deployed on Vercel.
- TLS termination for production traffic is handled by the hosting platform.
- HTTP to HTTPS redirect behavior is platform-managed in production.
- The supported production transport baseline is HTTPS with TLS 1.2 / 1.3 as
  provided by the deployment platform.

## Database transport

- Postgres / Neon connections must use SSL in production.
- `DATABASE_URL` should include `sslmode=require` for production Postgres /
  Neon deployments.

## Application-layer encryption

- Hirexa uses selective AES-256-GCM application-layer encryption for the
  highest-sensitivity stored text fields that do not need to remain queryable.
- Current protected field groups:
  - LinkedIn OAuth `accessToken`
  - LinkedIn OAuth `refreshToken`
  - Job Hunter Pack `resumeText`
  - Job Hunter Pack `notes`
  - Job Hunter Pack `optimizedResume`
  - Job Hunter Pack `coverLetter`
  - Job Hunter Pack `interviewPrep`
- Existing private `UserProfile` fields such as address, city, state,
  postal code, and date of birth continue to use the repo's existing profile
  encryption path.

## Security headers

`next.config.ts` adds a site-wide security header baseline including:

- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy`
- `Content-Security-Policy`
- existing `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
  behavior needed for Google OAuth / Google Drive picker compatibility

## Required environment variables

- `DATABASE_URL`
- `APP_ENCRYPTION_KEY`

If the deployment is using Neon Auth-managed cookies or shared auth services,
also configure:

- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET`

## Auth/session expectations

- Production auth cookies should remain `Secure` so they are only sent over
  HTTPS.
- Host trust must be configured correctly for the deployed origin.

## What this baseline does not claim

- It does not claim blanket encryption of every database field.
- It does not claim encryption of every uploaded blob or every JSON payload.
- It does not claim SOC 2, ISO 27001, HIPAA, or any other certification.
- It does not claim that all third-party integrations share the same controls.
- It does not guarantee absolute security of internet transport or storage.

## Current follow-up items outside app code

- Ensure production environment variables are set correctly in Vercel.
- Confirm `DATABASE_URL` includes `sslmode=require`.
- Review CSP domains whenever new browser-side integrations are added.
- Rotate or rewrite any legacy plaintext protected records after
  `APP_ENCRYPTION_KEY` is configured.
- Keep Stripe, Google OAuth, Google Drive Picker, and LinkedIn OAuth provider
  settings aligned with the deployed domains.
