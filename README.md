# Hirexa

Hirexa is an AI-powered job search platform built to help job seekers move faster from discovery to application, outreach, and interview preparation.

The platform combines smart job matching, resume-based personalization, AI-generated job search materials, recruiter outreach workflows, and career coaching into one experience.

## What Hirexa does

Hirexa is designed to support the full job search workflow:

- Discover relevant jobs with personalized matching
- Automatically apply to jobs using saved profile and resume data
- Improve resumes for ATS and role alignment
- Generate tailored cover letters
- Create recruiter outreach workflows
- Support interview preparation and career coaching

## Core features

### Smart Job Discovery
Find relevant roles faster with AI-powered matching based on skills, experience, and preferences.

### AI Job Auto Apply
Automatically apply to selected jobs using saved profile, resume, and application data.

### Resume Optimization
Generate stronger resume content and role-specific improvements.

### AI Cover Letter Generator
Create tailored cover letters for specific job postings.

### Recruiter Outreach Automation
Manage recruiter lead generation, templates, follow-ups, and message workflows.

### AI Career Coach
Get practical career guidance, profile feedback, and interview support.

## Product areas reflected in the codebase

The app currently includes models and flows for:

- authentication and user accounts
- user profiles and onboarding
- resume upload and resume experience parsing
- job applications and application tracking
- recruiter outreach campaigns, templates, leads, and messages
- Stripe-based subscription and payment tracking
- interview/job support packs
- email verification and OTP flows

## Tech stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend / App services
- Next.js app routes / server actions
- Prisma ORM
- PostgreSQL
- NextAuth

### AI / integrations
- OpenAI
- Anthropic
- Stripe
- SendGrid
- Playwright
- PDF and DOCX resume parsing utilities

## Repository structure



Scripts

At the repository root, scripts forward into my-app:

npm run dev
npm run build
npm run start
npm run lint

Root scripts call the corresponding scripts inside my-app.

Getting started
1. Clone the repository
git clone https://github.com/your-username/Hirexa.git
cd Hirexa
2. Install dependencies

Install root dependencies:

npm install

Install app dependencies:

cd my-app
npm install
cd ..
3. Configure environment variables

Create a local environment file for the app:

my-app/.env.local

At minimum, the Prisma schema shows the app uses:

DATABASE_URL=
DIRECT_URL=

Depending on which features you want enabled locally, you may also need variables for:

NextAuth

Stripe

OpenAI

Anthropic

SendGrid

reCAPTCHA

any job/data provider integrations used by your local setup

Use your existing project environment values and deployment settings as the source of truth.

4. Run database migrations

From the app directory:

cd my-app
npx prisma migrate dev
npx prisma generate
cd ..
5. Start the app

From the repository root:

npm run dev
Database overview

Prisma models in the project support:

User, Account, Session, VerificationToken

UserProfile

Resume, ResumeExperience, Experience, Bullet

JobApplication

OutreachCampaign, OutreachTemplate, RecruiterLead, OutreachMessage

StripePayment

JobHunterPack, Purchase

This structure supports personalized job search workflows, resume-aware AI features, billing, and outreach tooling.

Notes

The repo uses a root-level script wrapper and a nested app in my-app.

PostgreSQL is configured through Prisma.

Billing/subscription support is present through Stripe-related models.

Resume upload and parsing are part of the application flow.

The codebase includes both AI generation and recruiter workflow functionality.

Status

Hirexa is an active AI job platform focused on helping users:

discover better-fit jobs

apply faster

improve materials

automate outreach

prepare more effectively for interviews

Contributing

If you are collaborating on this project:

Create a branch from main

Make focused changes

Open a pull request

Keep updates scoped and easy to review

License

Add your preferred license here.

For private/internal use, you can replace this section with:

## License

Private repository. All rights reserved.

## Better short version for your repo

Because this is a **private product repo**, I’d personally end the file with:

## License

Private repository. All rights reserved.
