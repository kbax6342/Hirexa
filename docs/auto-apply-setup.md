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
- remote/browserbase flows keep using the existing remote launch path
- `PLAYWRIGHT_HEADLESS` continues to work as before for local non-remote runs
