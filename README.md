# COEcentials RMS

Recruitment management based on the supplied nine-slide workflow. The hosted workspace supports an RMS administrator username/password login, a central D1 database, private R2 attachments and server-enforced roles. Fictional sample data is separate at `/index.html?demo=1`; it stays in browser storage and is never imported into the shared database automatically.

## Implemented

- Standard request form, drafts, conditional replacement fields, duration, urgency, salary validation and required job description attachment for new headcount.
- Stable ticket IDs; clarification and resubmission retain the same ticket.
- HR headcount/budget review and a single HR approval. HR assigns a recruiter and explicitly authorises recruitment.
- Sourcing, screening, interview scheduling, interviewer feedback, offer preparation, sent/accepted/declined responses, partial vacancy fulfilment and closure.
- Owners, next action, due dates, hold/review date, reasoned cancellation/rejection/resume/reopen and retained history.
- Team lead, HR and Boss roles. HR and Boss manage team-lead access. Team leads review candidates for their requests, HOD positions or assigned interviews; financial and offer details are restricted to HR/Boss.
- Persisted in-app activity notifications and an overdue queue with escalation contact. Overdue reminders are calculated when the workspace opens or refreshes.
- Optional manual next-action dates; stage changes do not generate SLA deadlines.
- Search/filter, archive, server-recorded audit events, CSV reports, request exports and record JSON exports.
- Reports by BU, recruiter, request type and budget; ageing, outcomes, recorded approval time and time to fill.
- Responsive layout, readable text, keyboard controls, native modal focus handling, dark mode and reduced-motion GSAP transitions.

## First use

1. Sign in to RMS as admin using the configured password. The platform-private deployment retains its separate ChatGPT access gate. RMS_OWNER_EMAIL ties the administrator session to the existing owner membership.
2. Add colleagues under **Team access** with requester, approver, HR or administrator roles. Grant private Site access separately through Site sharing; RMS membership does not change Site access.
3. Manage position titles, ticket IDs, mailbox and email templates under **HR settings**. The requestor enters the HOD; HR sets salary and approves requests.
4. Create a request. New roles require a JD attachment. HR confirms headcount/budget review and routes the ticket. Approvers decide in order. HR assigns an owner and authorises recruitment.

No live personnel records are preloaded. Previous sample records remain available through the demo URL and are separate from live records.

## Outstanding rollout work

This is a shared pilot, not a completed enterprise rollout. Email delivery, automated background reminders/escalation, HRIS/ATS/Finance/SSO integrations, malware scanning, automated retention and disaster-recovery restoration are not connected. Access rules and closure policy need company configuration. Budget validation is recorded manually, without a Finance integration.

CSV/JSON exports are user downloads, not a disaster-recovery service. Audit events are appended atomically with ticket mutations and cannot be edited through the UI/API; database operators retain administrative access. Browser visual/form QA and live multi-user acceptance testing remain necessary before company rollout.

## Development

Node 22.13+; dependencies are pinned in `pnpm-lock.yaml`. Install with `npm run install:ci`, then `npm run build`. Sites/Vinext hosting integration is included. Schema changes use `npm run db:generate`; hosting applies migrations at deployment. API requests never create schema.

```sh
node --check public/app.js
node --check public/workspace.js
node tests/workflow.test.cjs
node tests/server.test.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
```

The server test uses Node SQLite with generated migrations and in-memory private file storage. It exercises authentication, roles, workflow gates, file access, concurrent changes and audit transactions. The front-end test uses a DOM stub; it is not browser QA.

Source: `public/` (UI), `lib/server.ts` (API), `lib/rules.ts` (permissions), `db/` and `drizzle/` (schema/migrations), `tests/` (checks). For a separate deployment, set RMS_OWNER_EMAIL to the Site owner’s email as a secret runtime setting. Never commit credentials or local runtime state.

Password login uses RMS_ADMIN_PASSWORD_HASH (salted PBKDF2-SHA256) and RMS_SESSION_SECRET runtime secrets. Passwords and session secrets are never shipped to the browser or repository. Sessions expire after eight hours; failed attempts are limited per trusted client IP. Team password accounts are not configured by the single administrator login.

Administrator Settings include editable recruitment email, sender display name and reply-to address. Saving these fields does not provision a mailbox or activate delivery. Login sessions use Secure, HttpOnly partitioned cookies for embedded views; same-origin mutation checks remain enforced. Unauthenticated shared navigation cannot display demo records.
