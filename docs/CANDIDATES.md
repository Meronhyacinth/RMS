# Candidate records and interviews

Recruit Centinels now stores candidate applications against each hiring request. HR manually enters applications received from JobStreet, Hiredly, email or another source; platform integration is not required.

## Staff access

1. Sign in as the administrator and open **Team access**.
2. Create HR staff with role **hr**, and team leads with role **interviewer**. Save each member first.
3. Use **Set password** to create/reset that member's password (12–256 characters). Staff sign in using their email address and this password. The bootstrap `admin` password remains configured on the server.
4. A password reset revokes that staff member's existing sessions. Inactive members cannot sign in or use existing sessions.

Ubuntu staff access uses these accounts directly. The hosted owner-private Site has an additional sharing gate: staff also need permission to open that Site. Adding a team member does not change Site sharing.

## HR workflow

1. Open **Candidates & interviews**, choose **Add candidate** and select the hiring position. Alternatively, open a hiring request and choose **Add candidate**.
2. Enter name, email, phone, application source/date, status and optional HR-only notes. Duplicate email applications within the same position are rejected; the same person can apply to different positions.
3. Save, then upload the résumé, cover letter or other application document. Each file may be PDF, DOC, DOCX or TXT, up to 2 MB. Candidate documents are separate from the hiring request's job-description attachments.
4. Once the position is in an authorised recruitment stage, choose **Schedule interview**, select the candidate, date/time and assigned interviewer/team lead.
5. Keep candidate statuses updated: Applied, Shortlisted, Interview, Offer, Hired, Rejected or Withdrawn. Candidate statuses are separate from the position's overall recruitment stage.

## Team lead workflow

Sign in with your staff email and password, then open **Candidates & interviews**. Only assigned candidates appear. Open a candidate to see application details, view PDFs in a new tab or download documents, and submit **Proceed**, **Reject** or **Hold** feedback. Feedback informs HR; it does not automatically reject candidates or decide hiring outcomes.

HR can see all candidate records and interview feedback. Requesters/approvers do not gain access to candidate documents merely by having access to a position. Interviewers cannot edit candidate profiles or upload documents; HR notes and other candidates' documents are withheld by the server, including direct download URLs.

Candidate records, documents and feedback are retained when a hiring request is closed. Reopening a request preserves earlier interviews as read-only previous-cycle records.

## Storage and demo

Ubuntu stores candidate profiles/interviews in the existing SQLite records, staff password hashes in a separate table and documents in private disk storage. The additive migration runs automatically when the updated Ubuntu server starts. Hosted deployments use D1/R2 with the same authorization rules.

`/index.html?demo=1` includes a fictional candidate and sample interview. Demo changes stay in browser storage and do not create staff accounts or write live candidate data.

No hiring-platform sync, public application portal, AI résumé scoring or email delivery is added by this change. Document malware scanning and automated retention remain outside the current implementation.

HR/admin can delete incorrectly uploaded candidate documents from the candidate profile. This removes the profile entry, file metadata and private stored object, and records a deletion event. Interviewers cannot delete documents. Upload the corrected document afterwards.

## Requester and HR financial responsibilities

Hiring request forms collect the role, headcount, justification and target date without salary, funding status or cost-centre inputs. These are completed by HR in the review dialog before routing for approval. The server ignores financial fields in requester create/edit payloads. Requester-only accounts do not receive salary/budget/cost-centre fields; assigned approvers and HR can review the relevant financial information. Existing stored financial records are preserved.
