# Versioning

The version displayed beside **CRM** is defined in `src/lib/version.ts`. For each product adjustment, update the version here and add a corresponding entry to the README changelog. The README is the project's version history.

Use the three numeric segments as follows. Increment only the segment that matches the scope, preserving the other segments:

| Scope of the adjustment                            | Segment to increment | Example                 |
| -------------------------------------------------- | -------------------- | ----------------------- |
| Small change that does not affect an entire object | Third segment        | `v1.02.03` → `v1.02.04` |
| Change to one object                               | Middle segment       | `v1.02.03` → `v1.03.03` |
| Change across the whole app                        | First segment        | `v1.02.03` → `v2.02.03` |

## Version history

- `v4.18.03` — Increment app version to identify the Vercel preview deployment.
- `v4.17.03` — Keep individual generated pipeline amounts between 3 and 4 digits and add shared responsive behavior for portrait, landscape, tablet, and mobile viewports.

- `v4.16.03` — Add the Reajuste Ferro step to the Quote screenflow, with annual percentage/date validation and per-flow diesel base details.

- `v4.15.03` — Add batch creation of monthly Schedule groups across a selected date range within the Opportunity term.
- `v4.14.03` — Add reusable, accessible business-rule explanations and responsive tooltips to Opportunity and Quote checklists.
- `v4.13.03` — Replace static success guidance with live business-rule checklists on Opportunity and Quote pages; show completion in green and pending requirements in red.
- `v4.12.03` — Make Faker Accounts management Accounts; generate supported railway Contracts/ACS with future-validity windows and application day; create eligible planned flows when needed without exposing the FLOU source rule; let the first Item-and-Schedule screenflow select CBS or net tariff; automatically apply the Opportunity day to diesel dates.
- `v3.12.03` — Enable Opportunity Path Negociação → Aprovação only after a Quote is completed and synced; refresh related Quote state after sync.
- `v3.11.03` — Replace separate Item and Agenda forms with a guided, atomic Item + Agenda screenflow, including multiple periods/services, deterministic Faker seed and server-side validation.
- `v3.10.03` — Add cascading Customer → Origin → Destination → Merchandise → Modal selection; fix seeded Schedule generation to respect service, tariff mode, allocation totals and Opportunity validity; show completion/sync errors as toasts.
- `v3.09.03` — Let users advance an Opportunity from Prospecting to Negotiation from the Quote actions, then open the requested individual or bulk form; document a regression review before each deployment.
- `v3.08.03` — Show toast notifications for individual and bulk record save errors, including Quote validation failures.
- `v3.07.03` — Add a dedicated Quotes tab as the first tab on eligible Opportunity records, with a full list and individual/bulk CRUD.
- `v3.06.03` — Add the rail Quote, Quote Line Item, and Quote Schedule records and pages, seeded related data, accordion editing, and Contract/ACS validation.
- `v2.06.03` — Refine the Opportunity Path key fields panel with a functional Edit action.

- `v2.05.03` — Add a Salesforce-style Path to the Opportunity record page, enforce stage transitions server-side, and update the README with the project changelog, data model, relationships, and validation rules.

- `v1.02.03` — Show the current app version beside CRM and establish the versioning policy.
- `v2.02.03` — Add global data reset and factory restore, plus object list customization.
- `v2.03.03` — Add the Opportunity object with Account relationship and seeded Faker generation, without inserting sample records.
- `v2.04.03` — Add a dedicated Opportunity record page and link to it from both object and Account related lists.
