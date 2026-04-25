# Auto Apply Setup

## Optional Playwright runtime flags

These environment variables are optional and only affect the server-side Hirexa auto-apply runner.

- `PLAYWRIGHT_PERSISTENT_CONTEXT=true`
  Use a dedicated Playwright persistent browser context for local automation runs.

- `PLAYWRIGHT_USER_DATA_DIR=/absolute/path/to/hirexa-playwright`
  Base directory for dedicated automation profile data when persistent context mode is enabled.
  Hirexa creates a per-run subdirectory under this base path so it does not attach to a real person's default browser profile.

- `PLAYWRIGHT_HEADED_DEBUG=true`
  Run the local Playwright browser headed for debugging on the machine where automation is executing.
  This does not change the normal Hirexa frontend UX for end users.

Existing behavior is preserved when these variables are not set:

- local runs stay on the current ephemeral Playwright context
- remote/browserbase and remote/scrapfly flows keep using the existing remote launch path
- `PLAYWRIGHT_HEADLESS` continues to work as before for local non-remote runs

## Scrapfly remote browser (optional)

Set `REMOTE_BROWSER_PROVIDER=scrapfly` and `SCRAPFLY_API_KEY` to run auto-apply on Scrapfly Cloud Browser with durable manual handoff support.

- Scrapfly sessions use `auto_close=false` so verification handoff can be resumed.
- Verification pages pause automation and return `VERIFICATION_REQUIRED`.
- Hirexa disconnects from Scrapfly for manual verification, then can reconnect on resume.
- Invalid targets (static assets, generic company pages, wrong-employer domains, or strategy-domain mismatch) are rejected before any browser launch.

## RTX careers safety behavior

RTX (`careers.rtx.com` / Workday) automation supports normal page-flow actions only:

- Accept Cookies / Cookie Preferences / Agree
- Allow (for normal in-page consent prompts)
- Apply Now
- Apply Manually
- Continue (when it is part of the normal application flow)

Automation does **not** bypass human verification controls such as CAPTCHA, Cloudflare checks, Press & Hold, or similar bot/security challenges.

When verification is detected (`Just a moment`, `Checking your browser`, `Verify you are human`, `Press & Hold`, `Cloudflare`, `CAPTCHA`, etc.):

- run status is set to `VERIFICATION_REQUIRED` / human intervention
- `stoppedAtUrl` is returned for UI stop-point handling
- replay-safe evidence is captured (signal text/title/last action)
- submission is not marked as successful

Teach Mode / saved strategy handling is preserved and now includes RTX-safe guidance so future replays focus on safe RTX controls and pause immediately for verification blockers.
