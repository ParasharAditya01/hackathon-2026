# AidFlow: Civic Micro-Logistics Prototype

AidFlow is a responsive hackathon prototype for coordinating perishable surplus food, volunteer riders, and shelter demand. It focuses on feasibility checks, inventory accounting, time-bound reservations, traceability, and recovery from disruptions.

## Run locally

Open \`index.html\` in a modern browser. No package installation or build step is required.

For a local static server, run from this folder:

\`\`\`bash
python3 -m http.server 8000
\`\`\`

Then open http://localhost:8000.

## Implemented in this frontend prototype

- Landing page explaining the problem, coordination flow, and failure-recovery approach
- Operations overview with metrics derived from the current demo dataset
- Donation registration with quantity, pickup-window, and deadline validation
- Batch inventory ledger for available, reserved, picked-up, delivered, and rejected quantities
- Smart allocation checks for stock, rider capacity, shelter demand, food type, recorded resources, pickup availability, estimated travel time, and configurable safety buffer
- Split-allocation scenario for 180 portions with riders capped at 40 portions each
- Rider fleet management and availability controls
- Shelter registration, demand changes, open/limited/closed status, accepted food types, and resource requirements
- Five-minute reservation TTL, manual expiry checks, one-time release of uncollected reserved stock, and reservation confirmation
- Delivery state transitions, pickup and delivery confirmation, failure reporting, reroute review, and escalation
- In-transit shelter-closure handling that preserves cargo state and requires an operator-approved feasible reroute or escalation
- Missing cooking-resource rejection for raw ration kits
- Alert center, searchable audit trail, CSV impact report, and five repeatable judge scenarios
- Resettable seed data and responsive layouts

## Judge scenarios

1. **Urgent expiry:** surfaces the batch with the shortest eligible safe-use window.
2. **Split delivery:** attempts to reserve 180 portions across riders without exceeding capacity or shelter demand; partial allocation is reported if constraints prevent completion.
3. **Ghost reservation:** expires an unconfirmed reservation and releases only its eligible, uncollected stock once.
4. **Shelter closure during transit:** preserves cargo state and presents a compatible alternative for operator approval, or escalates if none is feasible.
5. **Missing cooking resources:** blocks raw ration allocation to a shelter without recorded clean water and cooking fuel.

The **Reset demo** action restores the seeded dataset. Scenarios change browser-local demo records and are not connected to real operations.

## State and business rules

- Donation quantities are tracked as available, reserved, picked, delivered, and rejected; the sum is reconciled against the original quantity.
- Pending reservations count against inventory, rider capacity, and shelter demand.
- Confirmed reservations remain reserved until pickup. Pickup moves stock from reserved to picked.
- Delivered stock moves from picked to delivered and updates shelter fulfillment.
- Failed collected cargo is not returned to available stock. It requires an explicit spoiled/rejected disposition or escalation.
- Allocation requires estimated arrival time plus the selected safety buffer to fit before the safe-use deadline.
- Raw ration kits require recorded clean water and cooking fuel. Perishable batches require the recorded cold-storage capability.
- Closed shelters are excluded from new allocations. In-transit cargo requires an explicit recovery action.
- State transitions are validated in the client application.

## Important limitations

This is **not production-ready full-stack software**.

- Records persist in \`localStorage\` in the current browser only. They are not shared between users or devices.
- Business rules execute in client-side JavaScript and can be bypassed. There is no backend, transactional inventory lock, concurrency control, or authoritative server clock.
- The five-minute reservation TTL is checked on page activity or by the operator; it is not a server-enforced timer.
- Travel times are operator-entered demo estimates. No live maps, geocoding, routing, GPS, SMS, email, or push notifications are integrated.
- The demo-role selector is a visual demonstration only. There is no secure authentication or backend role-based authorization.
- The allocation heuristic chooses feasible options from the local dataset. It does not prove a globally optimal route or allocation.
- Shelter resource flags represent recorded operational information; AidFlow does not independently certify food safety.
- The app has been checked for JavaScript syntax and HTML-to-JavaScript element ID references in the repository source. It has **not** been verified through a live browser session or automated end-to-end test runner in this environment.

## Files

- \`index.html\`: landing page and operations UI
- \`styles.css\`: responsive visual system and mobile layouts
- \`app.js\`: demo data, validation, allocation logic, state transitions, alerts, audit, and judge scenarios
- \`favicon.svg\`: AidFlow icon

## Suggested next step for production

Add a real backend and database before relying on the application operationally. Enforce permissions, inventory reservations, reservation expiry, and state transitions server-side with atomic transactions; add integration tests for concurrent allocation and all five judge scenarios.
