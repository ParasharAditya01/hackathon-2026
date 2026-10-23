# AidFlow Architecture

## Product boundary
AidFlow is a client-side hackathon prototype coordinating donors, volunteer riders, receiving sites, and an operations coordinator. The root Vite/React app is the primary implementation.

## Implemented modules
- **src/App.jsx:** responsive operations workspace, forms, navigation, inventory views, assignment controls, alerts, audit and judge scenarios.
- **src/lib/dispatch.js:** domain validation, reservation lifecycle, split allocation, delivery transitions, direct-drop recovery, rerouting, and deterministic scenario functions.
- **src/lib/dispatch.test.js:** Node built-in unit tests for allocation, timeouts, compatibility, inventory movement and recovery.
- **src/styles.css:** responsive interface and mobile navigation.
- **.github/workflows/ci.yml:** test and production-build checks on pushes and pull requests.

## Core records
- **DonationBatch:** donor, aid type, original and remaining quantity, pickup window, safe-use deadline, location, and handling notes.
- **Rider:** capacity, transport, zone, availability and last-seen time.
- **ReceivingSite:** demand, delivered quantity, operating status, accepted aid types, clean-water/cooking-fuel flags, cold-chain and medical storage flags.
- **Reservation:** batch, rider, site, quantity, status, creation time, expiry time and assignment reference.
- **Assignment:** batch, rider, site, quantity, lifecycle state, deadline, travel estimate and history.
- **Event / Alert:** timestamped, auditable state changes and safety exceptions.

## Non-negotiable invariants
1. Never allocate a non-positive quantity.
2. Total allocation must not exceed available batch quantity, rider remaining capacity, or uncommitted receiving-site demand.
3. Pending claims and confirmed-but-unpicked claims expire after five minutes; stock is released exactly once.
4. A batch is not dispatchable if estimated arrival plus safety margin misses its safe-use deadline.
5. Site status, demand, and aid compatibility are rechecked before pickup and delivery.
6. Raw ration kits and infant formula require recorded clean water and cooking fuel.
7. Perishable food and short-life medical supplies require recorded cold-chain storage; medical supplies also require medical storage.
8. A site closing or filling its demand while cargo is in transit triggers recovery review. Cargo is never silently returned to available inventory.
9. Rerouting is allowed only to a compatible open site with enough uncommitted demand and sufficient remaining time.
10. Failed cargo must be explicitly marked spoiled/rejected or remain escalated.
11. Every important state transition records an audit event.
12. Concurrent claims must be serialized atomically by an authoritative backend in a production system.

## Dispatch strategy
Apply hard eligibility filters first: batch quantity and deadline, rider availability/capacity, site status/demand, resource prerequisites, pickup availability, estimated travel, and safety margin. Split only among feasible rider/site combinations. Ranking never overrides a safety constraint.

## Known limitations
All records and rules currently run in the browser and persist in localStorage. This is not multi-user, server-authoritative, or production-safe. Production requires backend authentication and authorization, a shared database, atomic reservations, server-enforced TTLs, concurrency tests, and real routing/notification integrations.
