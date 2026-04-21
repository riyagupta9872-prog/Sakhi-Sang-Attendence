# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Server

```bash
# Windows (double-click or run in terminal)
START_WEB.bat

# Or manually
python -m http.server 8080
# Then open http://localhost:8080
```

No build step — this is a pure static site. Any HTTP server works (VS Code Live Server, etc.).

## Tech Stack

- **Vanilla JS + HTML + CSS** — no framework, no bundler, no transpilation
- **Firebase** — Firestore (database) + Authentication (email/password)
- **Chart.js** — analytics charts in Reports tab
- **SheetJS (XLSX)** — Excel export/import
- **PWA** — service worker (`sw.js`) caches app shell; Firebase data always fetched live

## Architecture

All application logic lives in two files:
- [app.js](app.js) (~4,000 lines) — entire app logic
- [css/style.css](css/style.css) — all styling
- [index.html](index.html) — single HTML template with all tab panels

### Global State

`AppState` (app.js ~line 22) is the single source of truth:
- `userRole` / `userTeam` / `userId` — set on login, drive all permission checks
- `currentTab` / `currentSessionId` / `currentDevoteeId` — UI navigation state
- `devoteeSelectMode` / `selectedDevotees` — bulk-action state

### Role System

Three roles with hardcoded permission gates throughout the UI:
- `superAdmin` — full access to all tabs and all teams
- `teamAdmin` — same tabs but data scoped to their assigned team
- `serviceDevotee` — Attendance tab only (mark own attendance)

### Firestore Collections

| Collection | Purpose |
|---|---|
| `users` | Auth profiles with role + team |
| `devotees` | Devotee profiles (soft-deleted via `status: 'inactive'`) |
| `sessions` | Sunday class sessions |
| `attendanceRecords` | Per-session per-devotee attendance |
| `callingStatus` | Weekly calling outcome per devotee |
| `callingSubmissions` | Submission timestamps per coordinator per week |
| `events` / `eventDevotees` | Special events |
| `profileChanges` | Audit trail for profile edits |

### Caching

- `DevoteeCache` — 90-second TTL in-memory cache of active devotees
- `SessionsCache` — maps session IDs to session metadata
- Service worker version string is `sakhi-sang-v3` in `sw.js` — bump this to invalidate cached assets

### Key Code Regions in app.js

| Lines (approx) | Module |
|---|---|
| 7–14 | Firebase config |
| 22–40 | AppState |
| 42–182 | Auth (login / signup / password reset) |
| 183–269 | User profile |
| 271–327 | Tab visibility / role-based rendering |
| 582–648 | DevoteeDB (CRUD) |
| 814–872 | AttendanceDB |
| 875–989 | CallingDB |
| 1084–1139 | ReportsDB |
| 1317 | `TEAMS` constant (hardcoded list of 10 teams) |
| 1332–1384 | DateUtils |
| 1634–2301 | Excel export/import (multi-sheet, formatted) |

## Firebase Setup

To run against a new Firebase project, replace `firebaseConfig` in `app.js` lines 7–14 and:
1. Enable Email/Password auth in Firebase Console
2. Set Firestore security rules: `allow read, write: if request.auth != null;`
3. Create the first `superAdmin` user via the app's signup flow, then manually set `role: 'superAdmin'` in the `users` Firestore collection

## Important Conventions

- **No modules/imports** — everything is global in `app.js`. New functions go in the appropriate section by feature area.
- **Soft-delete only** — devotees are never hard-deleted; set `status: 'inactive'`.
- **Team scoping** — `teamAdmin` queries always include `.where('team', '==', AppState.userTeam)`. Don't add unscoped queries for `teamAdmin` role.
- **Fiscal year** — Apr–Mar (not Jan–Dec). The calling list export uses this for date filtering.
- **Date utilities** — use `DateUtils` helpers for Sunday snapping and display formatting; don't use raw `Date` arithmetic elsewhere.
