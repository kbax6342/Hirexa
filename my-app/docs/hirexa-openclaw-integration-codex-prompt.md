# Hirexa OpenClaw-Style Auto-Apply Integration Codex Prompt

Paste this whole prompt into Codex in VS Code.

---

You are working in the Hirexa repo.

## Goal
Integrate the stronger OpenClaw-style job application flow into Hirexa’s **existing** Playwright-based auto-apply system.

Do **not** add a separate `openclaw` CLI dependency and do **not** create a parallel auto-apply architecture.
Build on the files Hirexa already uses.

## What to preserve
- Preserve existing working auth, job search, audit page, and application tracking behavior.
- Preserve current routes and file structure.
- Keep diffs minimal and targeted.
- Do not replace broad app code that is unrelated to auto-apply.
- Do not make the site heavier than needed.

## Files to inspect first
1. `my-app/app/lib/playwright/applyRunner.ts`
2. `my-app/app/lib/playwright/auditRunner.ts`
3. `my-app/app/lib/jobApplicationAudit.ts`
4. `my-app/app/api/job-applications/[id]/apply/route.ts`
5. `my-app/app/api/job-applications/[id]/audit/route.ts`
6. `my-app/app/applications/[id]/audit/page.tsx`
7. `my-app/prisma/schema.prisma`

## Product intent
Hirexa already has an audit/apply flow and a `JobApplication` model.
The problem is that the current Playwright runner is too shallow.
It goes straight to the job URL, fills a few obvious fields, and clicks submit.

We want it to behave more like the stronger uploaded OpenClaw one-click-apply prototype:
- enter the job page
- click the real **Apply** CTA first when needed
- open the actual form/modal
- detect verification/captcha states earlier
- fill more input types safely
- upload resume more reliably
- detect success more reliably
- fail gracefully when human verification is required

## Required implementation work

### STEP 1 — expand canonical profile fields
Update `my-app/app/lib/jobApplicationAudit.ts`.

Keep the current structure, but expand the field map so the apply runner has richer values available.

Include these keys where data exists:
- `firstName`
- `lastName`
- `fullName`
- `email`
- `phone`
- `address`
- `city`
- `state`
- `postalCode`
- `country`
- `linkedin`
- `website`
- `authorizedUS`
- `sponsorship`
- `relocate`
- `startDate`
- `minCompensation`
- `compensationType`
- `resumeUploaded`

Keep required keys conservative so we do not block too aggressively.
Keep the required list close to the current version unless absolutely necessary.
A good default is:
- `firstName`
- `lastName`
- `email`
- `phone`
- `city`
- `state`

Do not break the existing audit page contract.

### STEP 2 — improve live form auditing
Update `my-app/app/lib/playwright/auditRunner.ts`.

Make it do the following:
1. Open the job URL.
2. Detect obvious verification/challenge states before doing anything else.
3. Try to click an application entry CTA if present, such as:
   - Apply
   - Apply now
   - Apply today
   - Start application
   - Continue application
   - Submit application
4. Wait briefly for modal/form content to appear.
5. Scrape controls with better label resolution from:
   - `label[for]`
   - wrapping label
   - `aria-label`
   - placeholder
   - element name/id
6. Include metadata for:
   - text inputs
   - textareas
   - selects
   - checkboxes
   - radios
   - file inputs / upload controls
7. Return richer audit data including:
   - `entryUrl`
   - `finalUrl`
   - `clickedApply` boolean
   - `verificationRequired` boolean
   - `action`
   - `method`
   - `auditItems`

Keep the file simple and server-safe.
Do not over-engineer.

### STEP 3 — upgrade the Playwright apply runner
Update `my-app/app/lib/playwright/applyRunner.ts`.

This is the main task.

Keep the same exported API shape if possible:
- input: `jobUrl`, `values`, `resumePath`
- output: success / verification required / failure

But improve behavior significantly:

#### 3A. application entry
Before filling fields:
- go to the job URL
- detect verification signals from title/html/body
- click likely apply buttons/links first if present
- handle modal/open-form flows
- then re-check for verification signals

#### 3B. better field matching
Use richer heuristics based on:
- name
- id
- `aria-label`
- placeholder
- nearby/wrapping label text

Support aliases for at least:
- first name
- last name
- full name / name
- email
- phone
- address
- city
- state / province
- postal code / zip
- LinkedIn
- website / portfolio
- compensation / salary

#### 3C. handle more control types safely
Implement safe handling for:
- text inputs
- textareas
- selects
- yes/no radios
- yes/no checkboxes when the label clearly maps to profile data
- file inputs

Examples of profile-backed yes/no prompts:
- authorized to work in the U.S.
- need sponsorship
- open to relocation

Do not auto-answer ambiguous legal questions.
Do not blindly click every checkbox.
Only answer when the label clearly matches a known field.

#### 3D. resume upload
Make resume upload more reliable.
Support:
- direct `input[type='file']`
- button/dropzone flows that reveal a file input

If resume upload still cannot be completed, return a clear failure reason.

#### 3E. submit behavior
Only attempt submit after filling/upload work is done.
Look for likely submit buttons such as:
- Submit
n- Submit application
- Apply
- Send application
- Continue

After click:
- wait for DOM change/navigation
- detect success using URL and body text
- check for thank-you / confirmation / application received signals

#### 3F. richer result payload
On success, return richer `submissionProof`, such as:
- final URL
- timestamp
- confirmation text if found
- maybe initial URL if easy to include

On failure, return the clearest possible reason.
If verification/captcha/turnstile/Cloudflare appears, return `verificationRequired: true`.

### STEP 4 — persist richer audit/apply state
Update `my-app/app/api/job-applications/[id]/apply/route.ts` and `my-app/app/api/job-applications/[id]/audit/route.ts` only as needed.

Prefer minimal changes.
Useful upgrades:
- persist richer audit data when returned from `runAuditMode`
- persist richer submission proof when returned from `runApplyMode`
- if `answersJson` already exists in Prisma, use it for merged answers / overrides if that is easy and low-risk

Do not redesign the API contract unless necessary.

### STEP 5 — add setup documentation
Create or update a small setup doc:
`my-app/docs/auto-apply-setup.md`

Document:
- install root deps
- install app deps if needed
- run Prisma generate/migrations as appropriate
- install Playwright browser:
  - `cd my-app`
  - `npx playwright install chromium`
- required envs already used by the app
- no external `openclaw` CLI is required for this Hirexa integration
- local-first testing steps
- note that browser automation on hosted environments must stay on Node runtime and may need suitable max duration settings

Do not add made-up env vars.
Only reference env vars already used by the app.

## Testing expectations
After coding, verify this flow logically:
1. create/open a `JobApplication`
2. run audit route
3. confirm audit output contains more useful fields and/or apply CTA discovery
4. run apply route against a normal ATS page
5. ensure runner can:
   - open form
   - fill fields
   - upload resume
   - detect success or verification required

## Progress markers
Work in this order and print progress markers as you go:
- `DONE 1/5 inspected existing files`
- `DONE 2/5 expanded canonical field map`
- `DONE 3/5 upgraded audit runner`
- `DONE 4/5 upgraded apply runner and routes`
- `DONE 5/5 added setup doc`

## Output format
At the end, give me:
1. root cause summary
2. exact files changed
3. anything I need to install locally
4. manual smoke test steps
5. any risks or edge cases still remaining

## Important constraints
- Keep existing code working.
- Do not rewrite the whole app.
- Do not introduce a separate service.
- Do not require the external OpenClaw CLI.
- Use the current Hirexa Playwright flow as the base.

## File paths to edit or create
- `my-app/app/lib/jobApplicationAudit.ts`
- `my-app/app/lib/playwright/auditRunner.ts`
- `my-app/app/lib/playwright/applyRunner.ts`
- `my-app/app/api/job-applications/[id]/apply/route.ts`
- `my-app/app/api/job-applications/[id]/audit/route.ts`
- `my-app/docs/auto-apply-setup.md`

---

If you can make the audit page UX better without broad rewrites, you may also make **small** improvements in:
- `my-app/app/applications/[id]/audit/page.tsx`

But only do that if it stays tightly scoped.
