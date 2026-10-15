# HR workflow update

- Only HR/admin approves hiring. Existing pending multi-person approval routes become a single HR step; completed historical decisions remain in history.
- Requesters do not enter HOD, salary or budget. HR enters HOD name (required), HOD email (optional), salary range and funding details during review. Job grade is optional.
- Salary maximum tracks the entered minimum when empty or lower. The server rejects maximums below minimum. Errors inside dialogs are shown inside the dialog, above the backdrop.
- HR can edit open hiring position details without restarting the workflow. An additional HR salary/HOD edit action is available while open. Requesters retain draft/clarification-only editing.
- Recording a hire does not close a position. Filled is an open state; HR can continue hiring or manually close the position. HR may increase vacancies when continuing hiring.
- HR's Close position dialog records Filled, Withdrawn or Cancelled as the outcome and allows HR to identify hired candidates. Existing/selected Hired candidates are preserved. Remaining Applied, Shortlisted, Interview and Offer candidates become Rejected; previously Rejected/Withdrawn candidates stay unchanged.
- Closure prepares rejection email drafts from the saved template. Scheduling candidate interviews prepares interview email drafts. Drafts remain “Standby — not sent”; no sending provider or external email action is connected. Drafts appear in the position's HR-only email section.
- HR/admin settings provide the editable position-title catalogue, safe ticket-ID renaming, interview/rejection subject/body templates, mailbox details, service-level targets and holidays. Supported template placeholders: {{candidate}}, {{position}}, {{ticketId}}, {{interviewDate}}, {{interviewer}}.
- Renaming a ticket updates database references and preserves aliases, candidates, audit history and private document storage keys. New numbering continues beyond manually assigned numbers. HQ/COE prefixes remain required and set the location.
- Pipeline typography is larger, overdue labels are bright red and the dashboard includes a Withdrawn position-outcome bar.

These rules supersede earlier documentation about manager/Finance approvals or automatic final closure. Email drafts are stored with the position and withheld from non-HR accounts.
