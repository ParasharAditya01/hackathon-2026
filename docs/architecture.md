# AidFlow Architecture

## Product boundary
AidFlow coordinates donors, volunteer riders, receiving shelters, and an operations coordinator.

## Proposed modules
```text
src/
  components/       Shared presentational components
  features/
    donations/      Batch registration and remaining quantity
    dispatch/       Eligibility filtering, ranking, allocation
    reservations/   Claim deadlines and release/reassignment
    shelters/       Demand, status, compatibility requirements
    simulation/     Deterministic failure scenarios for judging
  lib/              Time, validation, domain utilities
  App.jsx
  main.jsx
  styles.css
docs/architecture.md
```

Persistence and realtime transport will be selected after the OmniRush environment is verified. Domain rules must remain independent of UI components so they can be enforced authoritatively by a backend.

## Core records
- **DonationBatch**: id, donor, aidType, quantity, remainingQuantity, pickup window, safeUseDeadline, handling requirements, status.
- **Rider**: id, status, capacity, current location, lastSeenAt, handling capabilities.
- **Shelter**: id, status, openDemand by aid type, location, resource prerequisites.
- **Assignment**: id, batchId, riderId, shelterId, quantity, state, reservationExpiresAt, estimatedArrivalAt, safetyMargin.
- **Event**: id, entity references, event type, timestamp, actor, reason.

## Non-negotiable invariants
1. Never allocate a non-positive quantity.
2. Total allocation must not exceed available batch quantity, rider remaining capacity, or shelter open demand.
3. An unconfirmed reservation expires and releases capacity idempotently.
4. A batch is not dispatchable if expired or unable to arrive before its safe-use deadline with the required margin.
5. Shelter status, demand, and prerequisites are rechecked before pickup and delivery.
6. Rerouting is permitted only to a compatible destination with open demand and feasible arrival time.
7. If no safe recovery exists, escalate visibly. Never silently mark aid delivered.
8. Concurrent claims must be serialized or applied atomically by the authoritative backend.
9. Every state transition records an auditable reason.
10. Medical supplies need item-specific constraints; food rules must not be reused blindly.

## Dispatch strategy
Apply hard eligibility filters first: batch status/deadline, rider availability/capacity, destination status/demand, resource compatibility, and estimated arrival. Rank only eligible candidates by urgency, arrival time, capacity fit, and demand fit. Ranking never overrides safety.

## Five-hour build order
1. Foundation and navigation shell.
2. Domain model and pure validation helpers.
3. Demo seed data and operations dashboard.
4. Reservation lifecycle and capacity-aware splitting.
5. Failure simulation: timeout, demand closure in transit, direct shelter donation.
6. Verification, responsive polish, demo freeze.

## Demo disclaimer
Simulation values are synthetic. Travel time is not live navigation. The prototype must make assumptions visible and must not imply production-grade safety certification.
