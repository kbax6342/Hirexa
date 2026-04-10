# Hirexa Automation Worker

This service accepts background auto-apply requests from `my-app` and drives
OpenClaw through supported Gateway interfaces.

## Routes

- `POST /apply`
- `GET /runs/:id`
- `GET /health`

## Env

```bash
PORT=4010
AUTOMATION_SERVICE_TOKEN=replace-me
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=replace-me
OPENAI_API_KEY=replace-me
```

## Local run

```bash
npm install
npm run dev
```

Current run state is kept in worker memory. Deploy this worker as a single
instance unless you add a shared run store such as Redis or a database-backed
status table.
