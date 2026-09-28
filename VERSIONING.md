# Versioning

The version displayed beside **CRM** is defined in `src/lib/version.ts`. Update it for every product adjustment and add an entry to the project's Notion version history.

Use the three numeric segments as follows. Increment only the segment that matches the scope, preserving the other segments:

| Scope of the adjustment | Segment to increment | Example |
| --- | --- | --- |
| Small change that does not affect an entire object | Third segment | `v1.02.03` → `v1.02.04` |
| Change to one object | Middle segment | `v1.02.03` → `v1.03.03` |
| Change across the whole app | First segment | `v1.02.03` → `v2.02.03` |

## Version history

- `v2.06.03` — Refine the Opportunity Path key fields panel with a functional Edit action.

- `v2.05.03` — Add a Salesforce-style Path to the Opportunity record page, enforce stage transitions server-side, and update the README with the project changelog, data model, relationships, and validation rules.

- `v1.02.03` — Show the current app version beside CRM and establish the versioning policy.
- `v2.02.03` — Add global data reset and factory restore, plus object list customization.
- `v2.03.03` — Add the Opportunity object with Account relationship and seeded Faker generation, without inserting sample records.
- `v2.04.03` — Add a dedicated Opportunity record page and link to it from both object and Account related lists.
