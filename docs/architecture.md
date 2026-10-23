# AidFlow Architecture

## Product boundary
AidFlow coordinates donors, volunteer riders, receiving shelters, and an operations coordinator. The current build is a client-side hackathon simulation with synthetic seed data.

## Current modules
- `src/App.jsx`: dashboard, batch registration, dispatch controls, assignment lifecycle, failure injection, and activity feed.
- `src/lib/dispatch.js`: pure safety checks, capacity-aware split allocation, reservation expiry transition, and reroute eligibility.
- `src/lib/dispatch.test.js`: Node built-in tests for core invariants.
- `src/styles.css`: responsive operations interface.
- `docs/architecture.md`: this document.

## Core records
- **DonationBatch**: id, donor, aidType, quantity, remaining, pickup, safe-use deadline, handling requirements, status.
- **Rider**: id, status, capacity, last-seen label.
- **Shelter**: id, status, open demand by aid type, resources.
- **Assignment**: id, batchId, riderId, shelterId, quantity, state, reservation expiry, estimated arrival.
- **Event**: id, timestamp, title, detail, severity.

## Implemented dispatch rules
1. Quantity must be positive and cannot exceed remaining batch stock, rider capacity, or open shelter demand.
2. Estimated arrival must fit before the batch deadline with a 10-minute safety buffer.
3. Shelter prerequisites are hard constraints. Ration kits require clean water and cooking fuel in the current demo model.
4. Split allocation never assigns one rider more than once in the same allocation pass.
5. Unconfirmed reservation timeout releases stock and rider availability in the simulation.
6. At delivery time, site status, remaining demand, and food deadline are rechecked.
7. If the receiving site closes, attempt rerouting to an open, compatible site with sufficient demand; otherwise escalate visibly.
8. A delivery or reroute is not presented as a production-verified real-world outcome.

## Important architecture gap
These rules currently execute in the browser against in-memory state. They are not secure or authoritative against concurrent users or a malicious client. Before production, move validation and state transitions into a backend transaction, add authentication/authorization, persist an append-only audit trail, and use server time for reservation deadlines. Realtime subscriptions and external routing should be added only after the backend invariants are enforced.

## Test and run
- `npm install`
- `npm test`
- `npm run build`
- `npm run dev`

The tests use Node's built-in test runner. A CI workflow should run tests and production builds on pushes.

## Five-hour delivery sequence
1. Foundation and interface shell.
2. Domain rules and test harness.
3. Demo inventory, rider/shelter state, and dispatch allocation.
4. Timeout recovery and in-transit shelter closure scenario.
5. Test execution, responsive review, and demo rehearsal.

## Demo limitations
All records and travel estimates are synthetic. The app uses local browser state and resets on refresh. No authenticated backend, durable database, real-time multi-user synchronization, live GPS, or live map routing is connected. It is not certified for real food-safety or medical-supply decisions.
