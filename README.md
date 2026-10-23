# AidFlow — Last-Mile Spoilage & Civic Aid Coordination

AidFlow is a hackathon prototype for coordinating time-critical surplus food, short-life medical supplies, essential kits, volunteer riders, and receiving shelters. It treats safe-use deadlines, rider capacity, shelter demand, site compatibility, and unreliable reservations as operational constraints—not decorative dashboard metrics.

## Run locally

Requirements: Node.js 20+ and npm.

    npm install
    npm run dev

Open the local URL printed by Vite. To run domain tests and verify a production build:

    npm test
    npm run test:links
    npm run test:interactions
    npm run test:responsive
    npm run build
    npm run preview

## Visual identity and UX

- Editorial first-entry landing page with the headline “Move good food. Before time runs out.” and clearly labelled synthetic scenario figures.
- Bespoke AidFlow route mark, animated route line, destination point and compact wordmark, with reduced-motion support.
- Oxblood and porcelain design tokens, deep-wine navigation, warm near-white work surfaces, aged-brass dividers and semantic status colors.
- Purpose-built route illustration, operational hierarchy, responsive layouts and visible keyboard focus states.
- System-first font fallbacks avoid blocking the initial render on third-party font downloads.
- Custom embedded SVG favicon and updated page/theme metadata.

## Implemented workflows

- **Aid batches:** register prepared food, perishable food, raw ration kits, medical supplies, infant formula, and essential kits with donor, pickup window, handling notes, quantity, and safe-use deadline.
- **Constraint-aware dispatch:** filter infeasible options before allocation. Enforce available stock, rider remaining capacity, receiving-site demand, aid-type compatibility, resource prerequisites, pickup opening time, estimated travel, and a configurable safety buffer.
- **Split allocation:** split a bulk batch across multiple riders and receiving sites; reservations never exceed stock, rider capacity, or uncommitted site demand.
- **Ghost reservation protection:** five-minute claim and pickup TTL, live browser countdown, automatic expiration, and one-time stock release for unconfirmed claims.
- **Explicit handover lifecycle:** reservation confirmation, pickup, transit, delivery, cancellation before pickup, failure, reroute review, escalation, and final spoiled/rejected disposition.
- **Changing site demand:** direct community drop-offs reduce open demand. Incoming cargo is moved to recovery review when a receiving site fills its requirement or closes during transit.
- **Aid compatibility:** raw ration kits and infant formula require recorded clean water and cooking fuel; perishable food and medical supplies require cold-chain storage; medical supplies also require appropriate medical storage.
- **Operational controls:** manage rider availability, site status and demand, review alerts, inspect an audit trail, and reset synthetic demo records.
- **Judge resilience lab:** urgent expiry, 180-unit split delivery with 40-unit rider capacity, a 30-minute unresponsive-volunteer simulation, direct drop-off filling demand during transit, shelter closure during transit, and missing cooking resources.
- **Domain tests and CI:** Node's built-in test runner covers split allocation, idempotent claim expiry, safe-use quarantine, resource compatibility, reservation-to-pickup inventory movement, direct-drop recovery, and deadline safety. GitHub Actions runs tests and a Vite production build on pushes and pull requests.
- **Link audit:** `npm run test:links` checks landing-page anchors, the workspace brand target, all eight workspace navigation destinations, and any external anchor URLs. External destinations that block automated requests are reported as unverified instead of being silently treated as healthy.
- **Interaction audit:** `npm run test:interactions` uses Playwright to submit forms, verify search filtering and empty states, exercise site/rider controls and native dialogs, run all six resilience scenarios, and walk dispatch assignments through confirmation, pickup, transit, delivery, cancellation, failure, reroute, escalation, and disposition.

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

The React workspace remains a **client-side prototype**, and the new API is only an initial infrastructure foundation. Until authentication, authorization, transactional domain endpoints, background expiry, and frontend integration are completed and deployed, AidFlow is not a multi-user logistics platform.

- PostgreSQL schema and a minimal Node.js API are now included in the repository, but the existing React workspace still uses browser-local storage; the database is not yet the source of truth for the UI.
- There is not yet a secure login/session flow or backend role-based authorization.
- Operational business rules still run in browser JavaScript and can be bypassed by a modified client. Production mutations must be enforced on a trusted server using atomic transactions, row locking, and concurrency control.
- Reservation expiry still runs in the open browser tab. Server-side expiry and recovery are required for real operation.
- Travel estimates are manually entered. No live maps, geocoding, GPS, route optimization, SMS, email, or push notifications are integrated.
- Recorded resource flags are not independent verification of food safety, medical suitability, or regulatory compliance.

The prototype is intended for judging and demonstration only. Do not use it to make real food-safety or medical-distribution decisions.


## PostgreSQL backend foundation

The repository now includes an initial PostgreSQL schema and a minimal Node.js API service. This is an infrastructure foundation, **not yet a multi-user production application**.

- `server/schema.sql` defines persistent tables for users, aid batches, riders, receiving sites, reservations, assignments, alerts, and audit events.
- `server/index.js` applies the idempotent schema on startup and exposes `GET /api/health` and `GET /api/ready`.
- The API intentionally rejects state-changing HTTP methods. It does not yet expose operational data or write endpoints before authentication and server-side domain transactions are implemented.
- Inventory constraints are enforced by database checks; follow-up operational endpoints must also use transactions and row locking to prevent concurrent reservations from overselling stock, rider capacity, or receiving-site demand.
- No production credentials, database URLs, or secret tokens belong in GitHub.

### Configure locally

1. Install Node.js 20+ and run `npm install`.
2. Create a local PostgreSQL database named `aidflow`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to your local PostgreSQL connection string.
4. Run `npm run start:api`. The API listens on `PORT` (default `10000`).
5. Check `GET /api/health` for process health and `GET /api/ready` for database connectivity.

### Deploy on Render

1. Create a PostgreSQL database in Render. Keep it private and use its **Internal Database URL** for a backend service in the same Render region.
2. Create a separate Render **Web Service** for this repository, using the repository root as its Root Directory, `npm install` as the Build Command, and `npm run start:api` as the Start Command.
3. In the backend service's Environment settings, set `DATABASE_URL` to the database's Internal Database URL and `FRONTEND_ORIGINS` to the exact deployed frontend origin (no path and no trailing slash). Set `NODE_ENV=production`.
4. Add a health check path of `/api/health`; use `/api/ready` when the deployment platform should only consider the service healthy if PostgreSQL is reachable.
5. Never put `DATABASE_URL` in frontend environment variables, Vite-prefixed variables, source files, screenshots, or commits. Do not share the database URL in chat.

**Current limitation:** the existing React workspace still uses browser-local storage. It is not connected to this database yet. Do not treat this backend foundation as authentication, authorization, or production-ready aid dispatch. The next implementation stage is secure account/session handling, role checks, transactional domain endpoints, and migration of the UI away from local-only state.
