# Design and implementation notes

The user's screenshot is the visual authority: navy headings, a cool pale background, white rounded panels, softly tinted semantic statuses and generous spacing. The app adapts that vocabulary to an HR workspace with sidebar navigation and a readable request register. Decorative photography is intentionally unnecessary for this operational product.

## Requested skill references

- Taste Skill: https://github.com/Leonxlnx/taste-skill — reviewed reference-first design, consistent spacing and accessible input guidance. Its current primary scope excludes dashboards; dashboard-specific design follows Finesse and the supplied screenshot instead.
- Finesse UI: https://github.com/mouse-lin/finesse-skill — reviewed product/workflow distinction, restrained motion, tinted surfaces and action-oriented forms.
- Official GSAP skills: https://github.com/greensock/gsap-skills — reviewed core motion guidance. Motion is progressive enhancement and respects reduced-motion settings.
- Codegraph: the name maps to multiple repositories; no unique intended repository was supplied. No Codegraph execution or graph-index validation is claimed.
- Darwin: https://github.com/alchaincyf/darwin-skill — reviewed as a skill-optimization workflow, not a visual design system. No skill modifications or Darwin optimization run were necessary or performed.

These sources were inspected for task-appropriate guidance. They were not all installed as plugins, and this project does not claim exhaustive compliance with their unrelated workflows.

## Component conventions

Cards use 13px corners, inputs/buttons 7–8px and avatar circles. Navy is the primary text colour. Blue is the action colour. Teal, amber, rose and lavender communicate semantic status and retain visible labels. Motion uses opacity and vertical translation only, with an explicit reduced-motion path. Mobile collapses the sidebar and summary grid; wide data tables scroll horizontally.

## Workflow architecture

`seed / storage -> tickets -> filtered / events -> screen renderers`

`form / approval / status action -> validation -> ticket update -> activity history -> storage -> render`

`transition` centralizes permitted stage changes and approval gates. `approve` enforces ordered decisions and moves to Approved only when the entire route is complete. `Ready for Recruitment` is a separate HR action. The explicit sample workspace remains client-side. The default shared workspace uses server-authorised actions in lib/server.ts, transactional D1 writes, membership checks and private R2 downloads. public/workspace.js adapts the UI to the shared API.

## Icon refresh

Replaced font glyphs with a local Lucide SVG subset (26 icons), consistent 24-unit geometry, 1.75 strokes, currentColor, decorative ARIA attributes and labelled controls. A people/check mark identifies the recruitment workspace and provides its favicon. Navigation uses dashboard, document, approval badge, Kanban, archive, chart, history and settings icons. Notification, appearance, refresh, export, add, close and next actions share the same family. All assets are bundled locally; licensing is retained in vendor/LUCIDE-LICENSE.txt.

Applied Taste's targeted existing-project audit and Finesse's component-scope consistency guidance. Existing GSAP matchMedia/reduced-motion behavior remains in place. Darwin concerns skill optimization; no skill files were modified. Codegraph remains ambiguous and no unavailable CLI run is claimed. Browser visual QA is unavailable in this managed environment; syntax, screen-rendering and production-build checks are performed.
