# Recovery Notes

This rebuild was created from a pasted diff, not from the original files.

## What is exact from the pasted diff
- `.env.example` structure
- `README.md`
- `package.json`
- `start-local-worker.ps1`

## What is best-effort
- `src/server.mjs`

The original `src/server.mjs` was referenced as a very large diff, but its full
body was not present in the pasted text. This version is a compatible rebuild
that matches the contract expected by the app:

- `POST /apply`
- `GET /runs/:id`
- bearer auth with `AUTOMATION_SERVICE_TOKEN`
- in-memory run tracking
- status payloads shaped like the app expects
- proxy-style polling against `OPENCLAW_GATEWAY_URL`

## Important
The pasted text included real-looking token/API key values. Rotate them before
using this worker again.
