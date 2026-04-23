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
- **xlsx-js-style** — Excel export/import with cell-level styling (bold, fill, borders); same API as SheetJS but supports the `.s` property on cells
- **PWA** — service worker (`sw.js`) caches app shell; Firebase data always fetched live

## Architecture

All application logic is split across 8 JS files in [js/](js/), loaded in order via `<script>` tags (no bundler — all global scope):

| File | Contents |
|---|---|
| [js/config.js](js/config.js) | Firebase init, `AppState`, `TEAMS`, date utils, format helpers, `DevoteeCache` |
| [js/db.js](js/db.js) | Full `DB` object — all Firestore operations |
| [js/excel.js](js/excel.js) | `_xls`, `_xlsSheet`, all export/import functions, `IMPORT_FIELDS` |
| [js/ui-core.js](js/ui-core.js) | Auth flow, `applyRoleUI`, admin panel, tab switching, pickers, session init |
| [js/ui-devotees.js](js/ui-devotees.js) | Devotee list, form modal (5-tab), profile modal |
| [js/ui-calling.js](js/ui-calling.js) | Calling list, reports, late-submission tracker |
| [js/ui-attendance.js](js/ui-attendance.js) | Attendance sheet, Sunday config, live session marking |
| [js/ui-analytics.js](js/ui-analytics.js) | Reports tab, Care tab, Events tab |

- [css/style.css](css/style.css) — all styling
- [index.html](index.html) — single HTML template with all tab panels

### Global State

`AppState` ([js/config.js](js/config.js)) is the single source of truth:
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
- `sessionsCache` on `AppState` — maps session IDs to session metadata
- Service worker version string is `sakhi-sang-v25` in `sw.js` — bump this to invalidate cached assets

## Firebase Setup

To run against a new Firebase project, replace `firebaseConfig` in [js/config.js](js/config.js) and:
1. Enable Email/Password auth in Firebase Console
2. Set Firestore security rules: `allow read, write: if request.auth != null;`
3. Create the first `superAdmin` user via the app's signup flow, then manually set `role: 'superAdmin'` in the `users` Firestore collection

## Important Conventions

- **No modules/imports** — everything is global. New functions go in the `js/` file matching their feature area.
- **Soft-delete only** — devotees are never hard-deleted; set `isActive: false` (NOT `status: 'inactive'` — that field does not exist on devotee docs).
- **Team scoping** — `teamAdmin` queries always include `.where('team', '==', AppState.userTeam)`. Don't add unscoped queries for `teamAdmin` role.
- **Fiscal year** — Apr–Mar (not Jan–Dec). The calling list export uses this for date filtering.
- **Date utilities** — use `DateUtils` helpers for Sunday snapping and display formatting; don't use raw `Date` arithmetic elsewhere.
- **Firestore helpers** — use `TS()` for server timestamps and `INC(n)` for atomic increments (both defined in `config.js`); never fetch-modify-write a counter.
- **Cache invalidation** — call `DevoteeCache.bust()` after any write that creates, updates, or deletes a devotee, so the next read re-fetches from Firestore.
- **Dual timestamps** — `callingStatus` docs store both `updatedAt` (server `TS()`) and `updatedAtClient` (ISO string via `new Date().toISOString()`). Late-submission reports compare `updatedAtClient` hours against a threshold (21:00); don't omit this field when writing calling status docs.
- **Attendance time coloring** — use `attTimeStyle(markedAtISO)` (in `config.js`) to get inline style for late arrival highlights (12:30–12:45 → pink, 12:45–13:00 → salmon, after 13:00 → red); don't hardcode time color logic elsewhere.
- **First-user bootstrap** — on signup, `ui-core.js` checks if any user doc exists in `users`; if the collection is empty, the new user is assigned `superAdmin`. Subsequent signups default to `serviceDevotee` until manually upgraded.
