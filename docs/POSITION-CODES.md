# CLL Systems position codes

Position/request IDs use separate, permanent sequences:

- `COE-001`, `COE-002`, … for engineering positions.
- `HQ-001`, `HQ-002`, … for sales, software and corporate positions.

Software engineers/developers belong to HQ under the requested grouping. Sales roles take HQ even when their title mentions network/security. The form suggests a group from the title, and staff can select COE/HQ explicitly for less obvious positions before saving. Once allocated, the code and its group remain fixed. Sequences do not reset each year; the numeric part grows beyond three digits when necessary.

New request forms offer editable role suggestions based on https://cllsystems.com/careers/ (checked 15 October 2026): Team Lead - Network Security Engineer, Network Security Engineer, System Engineer – L1/L2, Software Sales Manager, Sales Specialist - Network Security, Inside Sales Representative, Client Manager (Executive Level), Solution Consultant - Infrastructure, Project Coordinator / Associate and Internship. Software Team Lead is also referenced on that page. Software Developer is an additional generic software-team suggestion, not a claim of a current advertised vacancy. Custom position names remain available.

These COE/HQ assignments follow the user's instruction, not a claim that CLL publishes these position codes. Other corporate roles default to HQ. The explicit group selector handles roles whose organisational placement is ambiguous.

## Existing records

An automatic migration replaces older generated IDs with COE/HQ codes in creation-date order within each group. Existing COE/HQ code ranges are retained and new numbering continues after their highest number. Candidate profiles, interviews, documents and private storage keys are preserved. Database references for notices, events and attachments are updated; an alias table retains old IDs for API lookups. Open forms from before the update may require a refresh because the record version changes during migration.

Ubuntu runs the migration automatically when rebuilt and started. No manual database reset is needed. Browser-only demo records also adopt readable codes when demo mode opens.

## Document upload alignment

Document type and file controls share a grid row. The action aligns to the controls instead of the extra helper text beneath the file input. At narrow widths, the form stacks into one column.
