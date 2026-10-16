# HR workflow update

- HR approves hiring. Existing pending multi-person approval routes become a single HR step; completed historical decisions remain in history.
- Requestors enter HOD name (required) and HOD email (optional). A registered HOD with the matching email can review candidates for that position. HR enters salary range and funding details during review. Job grade is optional.
- Salary maximum tracks the entered minimum when empty or lower. The server rejects maximums below minimum. Errors inside dialogs are shown inside the dialog, above the backdrop.
- HR can edit open hiring position details without restarting the workflow. An additional HR salary/budget edit action is available while open. Requesters retain draft/clarification-only editing.
- Recording a hire does not close a position. Filled is an open state; HR can continue hiring or manually close the position. HR may increase vacancies when continuing hiring.
- HR's Close position dialog records Filled, Withdrawn or Cancelled as the outcome and allows HR to identify hired candidates. Existing/selected Hired candidates are preserved. Remaining Applied, Shortlisted, Interview and Offer candidates become Rejected; previously Rejected/Withdrawn candidates stay unchanged.
- Closure prepares rejection email drafts from the saved template. Manual interview arrangements do not generate invitations or email drafts. Drafts remain “Standby — not sent”; no sending provider or external email action is connected. Drafts appear in the position's HR-only email section.
- HR/Boss settings provide the editable position-title catalogue, safe ticket-ID renaming, interview/rejection subject/body templates, mailbox details. Supported template placeholders: {{candidate}}, {{position}}, {{ticketId}}, {{interviewDate}}, {{interviewer}}.
- Renaming a ticket updates database references and preserves aliases, candidates, audit history and private document storage keys. New numbering continues beyond manually assigned numbers. HQ/COE prefixes remain required and set the location.
- Pipeline typography is larger, overdue labels are bright red and the dashboard includes a Withdrawn position-outcome bar.

These rules supersede earlier documentation about manager/Finance approvals or automatic final closure. Email drafts are stored with the position and withheld from non-HR accounts.

- The requestor and named HOD (matching staff email) decide Interview / Reject / On Hold. Assigned interviewers can view their candidates and record feedback. HR arranges interviews manually outside the system and can optionally record the date and interviewer. After the interview, the requestor decides Offer / Reject / On Hold. Reject requires a reason and prepares an email draft on standby.
- High-priority open requests appear in a red HR overview queue and notifications, with badges on lists and pipeline cards. HR notices for these requests are marked HIGH PRIORITY.
- After a candidate is marked Hired, HR can use Close hiring position directly from the candidate list/profile. Closure remains manual.

- SLA timing is removed. New requests have no automatic deadline; HR can set next-action due dates manually. Stage changes retain those dates. Hold review dates remain required. Existing recorded dates are retained.

- Access roles are Team lead, HR and Boss. Legacy admin accounts become Boss; requester, approver and interviewer accounts become Team lead without changing record ownership or passwords.
- HR and Boss manage team leads, including password setup, removal and restoration. HR cannot modify HR/Boss accounts. Removing access disables login while retaining historical records. Boss manages HR/Boss memberships; the bootstrap owner is protected.

## Requester-led flow

1. Any signed-in Team lead, HR or Boss submits a request.
2. HR reviews salary/budget and approves once. Hiring is ready for candidate uploads immediately.
3. HR uploads candidate profiles, resumes and cover letters; the requester is notified.
4. Requester selects Interview, Reject or On Hold. Interview creates an HR notice; dates and invitations are arranged externally. HR may record those details without generating a calendar event or email.
5. After the interview, requester confirms it took place and selects Offer, Reject or On Hold. A candidate hold does not put the entire hiring position on hold.
6. HR sends the offer externally, uploads an Offer letter document and records Preparing / Sent / Accepted / Declined / Withdrawn. Letter documents and salary details are HR/Boss-only.
7. Acceptance marks the candidate Hired, counts that vacancy once and leaves closure to HR. Withdrawal, including after acceptance, releases the vacancy and preserves history. HR manually closes the hiring position when recruitment is complete.

Success messages inside dialogs disappear after 3.5 seconds; error messages expire after 10 seconds. Existing legacy recruitment records retain their history and supported actions.

- Recorded hire milestone is set per candidate by HR in the candidate profile's offer follow-up, not in Settings. Offer accepted counts the hire upon acceptance; Employee joined waits for HR to confirm joining. Saving the same response twice does not count twice. The milestone is locked once the hire is counted.

- Position management uses aligned rows with visible Edit ticket ID and Edit position controls. IDs keep the standard HQ/COE prefix and at least three numeric digits. HR can rename an ID without breaking candidate/document links.
- Checkbox controls use a consistent 18px size aligned to the first text line across membership access, approvals, interview outcomes, hire milestones and closure selections.

- Download visible records produces an Excel workbook with Hiring requests, Candidates, Interviews and Activity sheets. Each sheet has column filters, a frozen header and content-sized columns; records are sorted by ticket ID. It exports the records already permitted for the signed-in user, not attachment file contents.

- Reports focus on open positions, candidate applications, hires and withdrawals, grouped by business unit, recruiter, position group and location. Request ageing/approval-duration tables and timing columns are removed from the report and its export.

## Login credentials

- Team Access supports entering a username and password together when adding a member. Usernames are case-insensitive and unique; existing email logins remain valid. Only password hashes are stored.
- All roles can use Change my password with their current password and matching new-password confirmation. Other sessions are invalidated and the current session is renewed.
- HR and Boss can use Edit login / password for every active account, including HR/Boss and the protected owner. This does not grant HR permission to change HR/Boss roles or remove the protected owner.
- The initial admin username continues to work. Once its password is changed inside the system, the database password overrides the original environment password. Another HR/Boss can reset it. The environment hash alone no longer overrides an existing stored account password.

- The top-bar appearance menu offers System default, Light, Dark and Soft. New browsers follow the operating system; saved choices remain in effect. System mode responds to operating-system colour changes.

- Saving the position catalogue prompts for a unique custom Ticket ID (for example `ASD123`) for each new title. Cancel leaves the saved catalogue unchanged. Assigned IDs appear below the list and persist in shared settings. The first request for the title uses that ID; later requests receive unique sequential IDs. Existing titles can be saved without assigning IDs retroactively.
