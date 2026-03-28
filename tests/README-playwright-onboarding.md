<!-- File: /Hirexa/my-app/tests/README-playwright-onboarding.md -->
# Public Signup + OTP Onboarding Smoke Test

This Playwright smoke test exercises the real public signup flow:

1. Open `/onboarding/account`
2. Create a fresh account
3. Read the OTP email from Mailosaur
4. Verify the code
5. Continue through post-auth onboarding if the app routes there

## Required environment variables

- `PLAYWRIGHT_BASE_URL`
  Optional. If omitted locally, Playwright starts `npm run dev` and uses `http://127.0.0.1:3000`.
- `MAILOSAUR_API_KEY`
- `MAILOSAUR_SERVER_ID`
- `E2E_PASSWORD`

## Run locally

```bash
npx playwright test tests/public-signup-otp-onboarding.spec.ts --headed
```

```bash
npx playwright test --ui
```

## Notes

- This is a real public-flow smoke test, not an auth bypass.
- Real reCAPTCHA v3 can still cause occasional flakiness locally or in CI if scoring is inconsistent.
- The workflow is configured to run with one worker in CI to reduce OTP collisions.
