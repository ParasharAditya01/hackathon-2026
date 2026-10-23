# AidFlow — Civic Aid Operations

A standalone, responsive hackathon prototype for coordinating surplus food, shelters, and volunteer riders.

## Run locally

Open `index.html` in a modern browser. For a local static server, run from this directory:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000. No npm install or build step is required.

## Features

- Operations dashboard with demo metrics and delivery queue
- Search and status filters, plus delivery status actions
- Donation intake form with validation and safe-until checks
- Partner shelter capacity and rider fleet overview
- Five resilience simulations: shelter closure, unavailable rider, expiry risk, demand surge, and connectivity loss

## Limitations

This is a front-end prototype. Data is session-local and resets on refresh. It does not provide real authentication, GPS tracking, backend persistence, SMS, or live dispatches. Google Fonts are optional; system fonts are used as fallbacks.

## Files

- `index.html` — application structure
- `styles.css` — responsive styles
- `app.js` — demo data and interactions
- `favicon.svg` — application icon
