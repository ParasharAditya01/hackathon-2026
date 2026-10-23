# AidFlow

**Safety-first coordination for perishable surplus and essential aid.**

AidFlow is a civic micro-logistics prototype connecting donors, volunteer riders, and receiving shelters. It is designed around expiry-aware dispatch, capacity-constrained allocation, reservation timeouts, compatibility rules, and safe recovery when demand changes.

## Project status

Phase 2: project foundation. The current scaffold establishes the app shell and development setup. Dispatch logic, persistence, and operational workflows are not implemented yet.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Build and preview: `npm run build` and `npm run preview`.

## Architecture

- `src/App.jsx`: application shell and primary navigation.
- `src/styles.css`: responsive design tokens and layout styles.
- `src/main.jsx`: React entry point.
- `docs/architecture.md`: domain boundaries, safety invariants, and implementation sequence.

## Safety principles

1. Reject assignments that cannot arrive before the safe-use deadline plus a configured safety margin.
2. Reservation expiry and food expiry are distinct states.
3. Allocation never exceeds available donor quantity, rider capacity, or open shelter demand.
4. Shelter compatibility requirements are hard constraints, not ranking preferences.
5. If no safe destination exists, escalate rather than pretending delivery succeeded.

This prototype is not a substitute for local food-safety rules, medical guidance, or professional handling requirements.
