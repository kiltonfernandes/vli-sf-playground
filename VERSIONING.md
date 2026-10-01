# Versioning

The version displayed beside **CRM** is defined in `src/lib/version.ts`. For each product adjustment, update the version here and add a corresponding entry to the README changelog. The README is the project's version history.

Use the three numeric segments as follows. Increment only the segment that matches the scope, preserving the other segments:

| Scope of the adjustment                            | Segment to increment | Example                 |
| -------------------------------------------------- | -------------------- | ----------------------- |
| Small change that does not affect an entire object | Third segment        | `v1.02.03` → `v1.02.04` |
| Change to one object                               | Middle segment       | `v1.02.03` → `v1.03.03` |
| Change across the whole app                        | First segment        | `v1.02.03` → `v2.02.03` |

## Batch commit naming convention

Start each batch commit subject with `vPREVIOUS → vNEW | scope: short description`, for example: `v4.18.03 → v4.18.04 | docs: define batch commit naming`. Use the same version range on every commit in a multi-commit batch, and give each commit a distinct short description. Increment `src/lib/version.ts` and add the new version to the top of the README changelog as part of the batch.

## Version history

- `v11.21.20` — Correct Quote Path stages, make approval requests idempotent and stale decisions invalid, add a next-action panel and direct approval tracking, and replace inert global controls with a CRM area selector.

- `v10.21.20` — Add the Port modal and the combined Rail + Port segment: port catalog (TIPLAM, TPD, TSL, TMIB terminals and vessel point), port services (loading, unloading, storage, weighing) without FRETE or Diesel Base, berth-operation coherence, ANTAQ storage terms, per-modal annual readjustment, per-modal Take or Pay records, port Jetsons mock prices and per-modal NetLex draft.

- `v9.21.20` — Add the post-contract instruments Sales Order (Ordem de Vendas) and Adjustment Curve (Curva de Ajuste): a single post-contract hub on signed contracts (Aditivo · Ordem de Vendas · Curva de Ajuste), inherited read-only conditions, a volume-redistribution panel with per-flow balance, customer-portal approval with 7-day validity, dedicated document pages, and a repaired README.

- `v8.21.20` — Fix the price-validation modal approval action by connecting its direct route handler to the approval workspace.

- `v8.21.19` — Ensure the “Na fila de aprovação” action always opens the approval workspace, including while the detailed approval identifier is still unavailable.

- `v8.21.17` — Add a Salesforce-style approval tracking view with process history and direct access from the approval queue and the quote status button.

- `v8.21.16` — Expose the first-readjustment date in the Opportunity creation form so long-term opportunities can satisfy the existing validation rule.

- `v8.21.15` — Randomize Take or Pay tolerances per Agenda when creating a batch, while keeping all-zero batches without Take or Pay.

- `v8.21.14` — Fix the Take or Pay screenflow runtime crash caused by a stale loading-state reference on the Continue button.

- `v8.21.13` — Persist Agenda tolerances before saving the linked Take or Pay configuration, keeping the new commercial-conditions step atomic from the user's perspective.

- `v8.21.12` — Add Take or Pay as a guided Commercial Conditions step in the Item and Agenda screenflow, with green/red business-rule mapping and persistence to the Opportunity.

- `v8.21.11` — Add a contextual Take or Pay warning and direct configuration action to the Opportunity Cotações tab when Agenda tolerances require setup.

- `v8.21.10` — Remove the premature Take or Pay checkbox from Opportunity creation and editing; the configuration now starts only from the Opportunity panel after Agenda tolerances exist.

- `v8.21.09` — Add “Validar e concluir” to the Jetsons price-validation modal, beside the recommended-price and revalidation actions.

- `v8.21.08` — Show all four Take or Pay tolerance fields in each Contract Agenda screenflow group, persist their values with server-side range checks, and keep them unavailable for ACS.

- `v8.21.07` — Add end-to-end Take or Pay setup, validation, Contract and addendum clauses; prohibit ACS Take or Pay; persist review/billing dates and compensation rules while keeping financial settlement external.

- `v7.21.07` — Make Ferro readjustment values editable with shared client/server rules; align diesel base dates to the Schedule month or previous month; repair single-service price edits by recalculating the full group allocation; add four Opportunity/Quote-specific contract clauses; update the README's current flow and addendum documentation.
- `v6.21.07` — Default Quote Schedule grouping to Período, add bulk price editing to the Jetsons comparison (percent adjustment or target deviation over Jetsons with live preview, allocation kept at 100%), add a one-click “Criar aditivo” action on contract Quotes that spawns the addendum Opportunity and Quote from the signed NetLex contract, and rename the initial NetLex status to “Análise jurídica” with an automatic migration of existing documents.
- `v6.20.07` — Add the “Embaralhar aditivo” shuffle to addendum Quotes: seeded scenario with at least 60% of the baseline Schedules changed or deleted and about 30% new Schedules, enforcing the app's date rules (unique Flow+month, no past or pre-term months, term extension for Schedules after the end, valid diesel base dates, annual readjustment when the term exceeds 365 days).
- `v6.19.07` — Implement contract addenda end to end (baseline Schedules as Keep, Change/Delete/Include operations, generated clauses, multiple addenda per contract, ACS excluded), add the NetLex Assinatura status with addendum materialization and version history, style the Quote and NetLex Paths, group Quote Schedules by period, and allow free end months in batch Schedule creation.
- `v5.19.07` — Widen the Jetsons comparison modal, simplify approval to the Vendas/Aprovador profiles, let approved prices pass the Opportunity gate, and add an approval-gated NetLex contract snapshot with an initial-status preview.
- `v5.19.06` — Add deterministic Jetsons market prices, show them across the five-level Quote grouping, edit prices by Schedule, and govern approval by the worst individual Schedule so a large discount cannot be diluted by an Item average. Allow alternate Quotes to reuse the same Flow periods, refresh Quote status after inline edits, and add an X close button to toast notifications.
- `v5.19.05` — Make the opportunity term configurable from the Quote and the item screenflow, keep the global header responsive in a single row, show the Aprovação tab only for logged approvers, re-seed the built-in approvers on server boot, and skip the Reajuste Ferro step for ACS quotes.
- `v5.19.04` — Add price validation against recommended prices (Jetsons mock), configurable approval thresholds (Gerente Geral/Diretoria), approver login in Settings, the Aprovação tab with a Salesforce-style approve/reject queue, and the Aprovadores/Preços Recomendados/Aprovações objects with Faker generators.
- `v4.18.04` — Define a batch commit subject convention that includes previous and new versions.
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
