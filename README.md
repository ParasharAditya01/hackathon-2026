# AidFlow

**Safety-first coordination for perishable surplus and essential aid.**

AidFlow is a civic micro-logistics hackathon prototype for donors, volunteer riders, receiving shelters, and operations coordinators.

## Current prototype capabilities

- Register synthetic donation batches with quantities and safe-use windows.
- View remaining stock and deadline urgency.
- Reserve loads against available rider capacity and receiving-site demand.
- Automatically split a batch across eligible riders and shelters.
- Block allocations that violate expiry buffer, capacity, open demand, site status, or resource prerequisites.
- Simulate ghost-reservation expiry and release stock/rider capacity.
- Mark assignments in transit, simulate a receiving-site closure, and attempt a compatible reroute.
- Escalate when no safe fallback destination is available.
- Record session events in an in-memory activity feed.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Project structure

- `src/App.jsx`: interactive operations dashboard and simulation controls.
- `src/lib/dispatch.js`: pure eligibility, allocation, timeout, and rerouting rules.
- `src/styles.css`: responsive visual system and application layouts.
- `src/main.jsx`: React entry point.
- `docs/architecture.md`: domain model, safety invariants, and limitations.

## Important limitations

This is a **local, in-memory demonstration**, not a production dispatch service. Refreshing the page resets demo state. There is no authenticated backend, database, real-time multi-user sync, GPS/navigation integration, or server-enforced reservation expiry. The timeout is deliberately triggerable for judging. Travel times and all seed records are synthetic. Do not use this prototype to make real food-safety or medical-handling decisions.

## Safety invariants

1. Allocation quantity must be positive and within batch remainder, rider capacity, and open demand.
2. Arrival estimate plus a 10-minute safety buffer must fit before the batch deadline.
3. Shelter resource requirements are hard constraints.
4. Unconfirmed reservations can be released to return stock and riders to the demo pool.
5. Changed demand is rechecked; unsafe reroutes escalate instead of being marked delivered.
6. Production deployment requires authoritative server-side enforcement and atomic updates.
