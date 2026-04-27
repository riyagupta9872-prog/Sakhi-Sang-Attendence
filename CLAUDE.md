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

All application logic is split across JS files in [js/](js/), loaded in order via `<script>` tags (no bundler — all global scope):

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
| [js/ui-activities.js](js/ui-activities.js) | Activities tab — Book Distribution, Donations, Registrations, Service sub-tabs |

- [css/style.css](css/style.css) — all styling
- [index.html](index.html) — single HTML template with all tab panels

### Global State

`AppState` ([js/config.js](js/config.js)) is the single source of truth:
- `userRole` / `userTeam` / `userId` / `userPosition` — set on login, drive all permission checks (`userPosition` is a free-text field from the user profile, e.g. `'Facilitator'`)
- `currentTab` / `currentDevoteeId` — UI navigation state
- `devoteeSelectMode` / `selectedDevotees` — bulk-action state
- **`AppState.filters`** — single context filter shared across every tab:
  - `sessionId` (canonical date string, e.g. `'2026-04-26'`)
  - `team` (`''` = All)
  - `callingBy` (`''` = All)
  - `period` (`'session'|'month'|'quarter'|'fy'`) — Reports-only
  - `periodAnchor` — anchor date for Period aggregation
- `currentSessionId` and `currentReportSessionId` are **derived getters/setters** off `AppState.filters.sessionId` so existing DB calls keep working without rewriting them.

### Master Filter Bar (one bar, every tab)

A persistent context bar sits below the tab nav (`#master-filter-bar` in [index.html](index.html), wired in `initMasterFilterBar()` in [js/ui-core.js](js/ui-core.js)). Three controls — Session, Team, Calling By — drive every tab. Reading helpers: `getFilterTeam()`, `getFilterCallingBy()`, `getFilterSessionId()`. Writing: always go through `dispatchFilters({...})` which validates (e.g. team-locked roles), updates `AppState.filters`, and fires a `filtersChanged` CustomEvent on `window`.

**Reactive tab updates**: Each tab subscribes to `window.addEventListener('filtersChanged', handler)` and re-calls its own `load*()` function when filters change. All `load*()` functions are idempotent — they can be called repeatedly and always re-render from current `AppState.filters`. `switchTab(tab, btn)` calls the active tab's `load*()` on switch; `_mfbOnFiltersChanged()` re-calls it when any filter changes. Never cache query results across filter changes.

**Legacy widget mirroring**: Older per-tab `<select>` elements (e.g. `#filter-team`, `#calling-filter-team`) are kept in sync with the master bar via `_mfbAttachLegacyMirror()` — changes to either side propagate to the other. Don't add new per-tab filter selects; route everything through `dispatchFilters()`.

**Filter taxonomy**:
- **Context filters** (master bar): Session, Team, Calling By — set the dataset
- **Content filters** (local to each tab): search box, Devotee Status, Calling Reason — narrow within the dataset

**Per-tab semantics**:
- Devotees: respects Team + Calling By; Session ignored
- Calling: respects all three. If master Session ≠ configured calling week, the tab enters a **read-only historical view** (purple banner)
- Attendance: respects Session (drives live mark / past view) + Team (narrows candidates)
- Reports: respects all three + has its own Period segment (`setReportPeriod`) for Month/Quarter/FY aggregation. `_reportRange()` returns `{ start, end, period }`.
- Care: respects Session (anchor for Absent / Said-Coming math) + Team
- Events: respects Team only
- Calling Mgmt: respects all three (week-anchored via Session)

The Calling tab's Submit window is gated by `settings/callingWeek.callingDate` vs today (unchanged) — master Session only changes which week's data you VIEW, never which week you can submit for.

### Role System

Three roles with hardcoded permission gates throughout the UI:
- `superAdmin` — full access to all tabs and all teams
- `teamAdmin` — same tabs but data scoped to their assigned team
- `serviceDevotee` — Attendance tab only (mark own attendance)

### Firestore Collections

| Collection | Purpose |
|---|---|
| `users` | Auth profiles with role + team |
| `devotees` | Devotee profiles (soft-deleted via `isActive: false`) |
| `sessions` | Sunday class sessions |
| `attendanceRecords` | Per-session per-devotee attendance |
| `callingStatus` | Weekly calling outcome per devotee |
| `callingSubmissions` | Submission timestamps per coordinator per week |
| `events` / `eventDevotees` | Special events |
| `profileChanges` | Audit trail for profile edits |

### Sessions

Sessions are created on-demand via `DB.getOrCreateSession(sunday)` — there is no pre-population step. `initSession()` (called at login) sets `AppState.currentSessionId` and populates `sessionsCache`. Cancelled sessions carry `is_cancelled: true` on the session doc; attendance marking is still allowed on cancelled sessions. `loadSessionByDate(dateStr)` snaps to the nearest Sunday before creating/fetching.

### Signup Approval Workflow

New signups land in a `signupRequests` sub-collection as pending. `subscribePendingSignups()` (super admin only) sets up a live Firestore listener and updates a badge count. `approveSignupRequest(id)` creates the `users/{uid}` doc that `onAuthStateChanged` looks for; `rejectSignupRequest(id)` blocks without creating the doc (sign-in shows rejection message). Until a `users/{uid}` doc exists, the user cannot log in.

### Care Tab

The Care tab anchors on the master Session date and computes four lists:
- **Absent**: active devotees not in `attendanceRecords` for the session
- **Said Coming Didn't Come**: `callingStatus.comingStatus == 'Yes'` but absent from attendance
- **Inactive**: flagged `inactivityFlag: true` after repeated absence
- **Returning Newcomers**: newly created devotees attending for the first time after an initial gap

### Caching

- `DevoteeCache` — 90-second TTL in-memory cache of active devotees
- `sessionsCache` on `AppState` — maps session IDs to session metadata
- **Service worker strategies** (`sw.js`): (1) Firebase/Firestore endpoints — always bypass cache; (2) app JS files (`/js/*.js`) — network-first with cache fallback so new code loads without hard refresh; (3) static assets (CSS, fonts, CDN libraries) — cache-first. Bump `sakhi-sang-vXX` version string on every deploy to invalidate all caches. Firestore persistence is enabled with `synchronizeTabs: true`.

### UI Utilities (global helpers in [js/ui-core.js](js/ui-core.js))

- **Modals** — `openModal(id)` / `closeModal(id)` toggle `.hidden` on `.modal-overlay` elements. A `popstate` listener closes all open overlays; `history.pushState()` is called whenever any overlay opens to give back-button support. Modal IDs always end with `-modal`.
- **Toasts** — `showToast(msg, type)` renders in `#toast`; `type` is `''` (neutral), `'success'`, or `'error'`. Auto-dismisses after 3 s; repeated calls reset the timer.
- **Field errors** — `showFieldError(fieldId, msg)` adds `.error` class + message text; `clearFieldError(fieldId)` removes it. Used in form validation before any DB write.
- **Number picker** — `openNumberPicker(devoteeId, name, mobile, altMobile)` lets a coordinator choose primary vs alternate mobile; `makePrimaryNumber()` swaps the two numbers in Firestore atomically.

### Picker Control Pattern (autocomplete)

Multi-select autocomplete fields (Facilitator, Reference By, Calling By) use a `.picker-wrap` → `.picker-input` + `.picker-menu` structure. Input `.value` holds the selected name; `.has-value` class controls styling. `clearPicker(wrapperId, inputId)` resets both. Don't hand-roll new pickers; reuse this pattern.

### Function Naming Conventions

| Prefix | Meaning |
|---|---|
| `load*()` / `load*Tab()` | Async, idempotent — refetch + re-render from current filters |
| `open*Modal()` / `open*()` | Show an overlay; may populate fields first |
| `close*()` / `hide*()` | Remove overlay or hide element |
| `_mfbOn*()` | Master filter bar internal handlers |
| `_frPick*()` | Filter-related picker handlers |

### CSS Design System

[css/style.css](css/style.css) uses CSS custom properties on `:root`:
- **Colors**: `--color-primary` (#1a5c3a forest green), semantic tokens (`--color-success`, `--color-danger`, `--color-warning`)
- **Layout**: `--header-h: 64px`, `--nav-h: 52px`
- **Radius tokens**: `--radius-xs` (4px) → `--radius-lg` (16px)
- **Shadow tokens**: `--shadow-xs` → `--shadow-lg`
- **Typography**: Cinzel serif for headings, Nunito sans-serif for body

Always use these tokens rather than hardcoding values.

## Firebase Setup

To run against a new Firebase project, replace `firebaseConfig` in [js/config.js](js/config.js) and:
1. Enable Email/Password auth in Firebase Console
2. Set Firestore security rules: `allow read, write: if request.auth != null;`
3. Create the first `superAdmin` user via the app's signup flow, then manually set `role: 'superAdmin'` in the `users` Firestore collection

## Important Conventions

- **No modules/imports** — everything is global. New functions go in the `js/` file matching their feature area.
- **camelCase ↔ snake_case** — Firestore documents store camelCase fields (e.g. `teamName`, `isActive`). `DB` methods return snake_case objects to the UI (via `toSnake()` in `db.js`). Writes go through `toCamel()`. Don't bypass these converters.
- **Soft-delete only** — devotees are never hard-deleted; set `isActive: false`. A separate `isNotInterested: true` flag (with `notInterestedAt` timestamp) moves a devotee to the "Not Interested" list without deactivating them.
- **Team scoping** — `teamAdmin` queries always include `.where('team', '==', AppState.userTeam)`. Don't add unscoped queries for `teamAdmin` role.
- **Fiscal year** — Apr–Mar (not Jan–Dec). The calling list export uses this for date filtering.
- **Date utilities** — use `DateUtils` helpers for Sunday snapping and display formatting; don't use raw `Date` arithmetic elsewhere.
- **Firestore helpers** — use `TS()` for server timestamps and `INC(n)` for atomic increments (both defined in `config.js`); never fetch-modify-write a counter.
- **Cache invalidation** — call `DevoteeCache.bust()` after any write that creates, updates, or deletes a devotee, so the next read re-fetches from Firestore.
- **Dual timestamps** — `callingStatus` docs store both `updatedAt` (server `TS()`) and `updatedAtClient` (ISO string via `new Date().toISOString()`). Late-submission reports compare `updatedAtClient` hours against a threshold (21:00); don't omit this field when writing calling status docs.
- **Attendance time coloring** — use `attTimeStyle(markedAtISO)` (in `config.js`) to get inline style for late arrival highlights (12:30–12:45 → pink, 12:45–13:00 → salmon, after 13:00 → red); don't hardcode time color logic elsewhere.
- **First-user bootstrap** — on signup, `ui-core.js` checks if any user doc exists in `users`; if the collection is empty, the new user is assigned `superAdmin`. Subsequent signups default to `serviceDevotee` until manually upgraded.
- **`callingMode` field** — devotee docs may carry `callingMode: 'not_interested'` or `callingMode: 'online'`; dashboard aggregation excludes these from the main counts. Don't conflate with `isNotInterested` (which is a status flag); `callingMode` controls how/whether the devotee is counted in stats.
- **Import batching** — `importDevotees()` in `excel.js` chunks writes in batches of 400 to stay within Firestore batch-write limits. Duplicate detection uses name (case-insensitive) + mobile as the key; same name with different mobile is allowed.
- **Admin data clearing** — `clearDataForDate(date)`, `clearDataForTeamDate(team, date)`, and `clearAllData()` are super-admin-only destructive operations that batch-delete attendance + calling records and decrement `lifetimeAttendance`. All require explicit confirmation; `clearAllData()` requires double confirmation.
