# AidFlow — Last-Mile Spoilage & Civic Aid Coordination

AidFlow is a hackathon prototype for coordinating time-critical surplus food, short-life medical supplies, essential kits, volunteer riders, and receiving shelters. It treats safe-use deadlines, rider capacity, shelter demand, site compatibility, and unreliable reservations as operational constraints—not decorative dashboard metrics.

## Run locally

Requirements: Node.js 20+ and npm.

    npm install
    npm run dev

Open the local URL printed by Vite. To run domain tests and verify a production build:

    npm test
    npm run build
    npm run preview

## Implemented workflows

- **Aid batches:** register prepared food, perishable food, raw ration kits, medical supplies, infant formula, and essential kits with donor, pickup window, handling notes, quantity, and safe-use deadline.
- **Constraint-aware dispatch:** filter infeasible options before allocation. Enforce available stock, rider remaining capacity, receiving-site demand, aid-type compatibility, resource prerequisites, pickup opening time, estimated travel, and a configurable safety buffer.
- **Split allocation:** split a bulk batch across multiple riders and receiving sites; reservations never exceed stock, rider capacity, or uncommitted site demand.
- **Ghost reservation protection:** five-minute claim TTL, live browser countdown, automatic expiration, and one-time stock release for unconfirmed claims.
- **Explicit handover lifecycle:** reservation confirmation, pickup, transit, delivery, cancellation before pickup, failure, reroute review, escalation, and final spoiled/rejected disposition.
- **Changing site demand:** direct community drop-offs reduce open demand. Incoming cargo is moved to recovery review when a receiving site fills its requirement or closes during transit.
- **Aid compatibility:** raw ration kits and infant formula require recorded clean water and cooking fuel; perishable food and medical supplies require cold-chain storage; medical supplies also require appropriate medical storage.
- **Operational controls:** manage rider availability, site status and demand, review alerts, inspect an audit trail, and reset synthetic demo records.
- **Judge resilience lab:** urgent expiry, 180-unit split delivery with 40-unit rider capacity, a 30-minute unresponsive-volunteer simulation, shelter demand filling during transit, and missing cooking resources.
- **Domain tests and CI:** Node's built-in test runner covers split allocation, idempotent reservation expiry, resource compatibility, reservation-to-pickup inventory movement, direct-drop recovery, and deadline safety. GitHub Actions runs tests and a Vite production build on pushes and pull requests.

## Core inventory rules

- Available + reserved + picked + delivered + rejected must equal original quantity for each batch.
- Pending reservations count against both rider capacity and receiving-site demand.
- Confirming a reservation creates an assignment but does not move stock out of reserved.
- Pickup moves quantity from reserved to picked.
- Delivery moves quantity from picked to delivered.
- Expired pending reservations release quantity exactly once.
- Failed cargo is never silently returned to available stock. It must be marked spoiled/rejected after review or remain escalated.
- A delivery cannot be marked successful after the safe-use deadline or when the receiving site's status, demand, or recorded compatibility requirements no longer permit it.
- If no safe alternate destination exists, the assignment remains escalated for operator disposition.

## Demo controls

Use the Resilience lab navigation to run repeatable scenarios. Use Reset scenario data to restore the seed dataset between demonstrations. Scenario data and records persist in the current browser's localStorage; they are synthetic and are not shared across devices.

## Limitations — not production-ready

This repository currently contains a **client-side prototype**, not a deployed multi-user logistics platform.

- There is no server, shared database, secure login, or backend role-based authorization.
- Business rules run in browser JavaScript and can be bypassed by a modified client. Production must enforce them on a trusted server using atomic transactions and concurrency control.
- Reservation expiry runs in the open browser tab. Server-side expiry and recovery are required for real operation.
- Travel estimates are manually entered. No live maps, geocoding, GPS, route optimization, SMS, email, or push notifications are integrated.
- Recorded resource flags are not independent verification of food safety, medical suitability, or regulatory compliance.

The prototype is intended for judging and demonstration only. Do not use it to make real food-safety or medical-distribution decisions.
