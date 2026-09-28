# Versioning

The version displayed beside **CRM** is defined in `src/lib/version.ts`. Update it for every product adjustment and add an entry to the project's Notion version history.

Use the three numeric segments as follows. Increment only the segment that matches the scope, preserving the other segments:

| Scope of the adjustment | Segment to increment | Example |
| --- | --- | --- |
| Small change that does not affect an entire object | Third segment | `v1.02.03` → `v1.02.04` |
| Change to one object | Middle segment | `v1.02.03` → `v1.03.03` |
| Change across the whole app | First segment | `v1.02.03` → `v2.02.03` |

## Version history

- `v1.02.03` — Show the current app version beside CRM and establish the versioning policy.
