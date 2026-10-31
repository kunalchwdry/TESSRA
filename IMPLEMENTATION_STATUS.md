# TESSRA — Implementation Status

Last verified checkpoint: official pipeline passing the official validator; all app checks green (see docs/TESTING.md for commands and outputs).

## What works end-to-end (verified)

### Official Crunch Week pipeline (the judged core)
- `engine/` — Python OR-Tools **CP-SAT** engine: all hard rules H1–H14, soft S1–S6 with official weights, elective baskets, fixed slots, faculty daily limits, lab starts, lunch.
- Spectra bookings: official priority order + role caps + submission tiebreak, cancellations, windows, alternatives with reasons, institute-event `session_overrides` (displaced classes re-validated).
- Exams: AM/PM, half capacity, multi-room, group clash rules.
- Disruption repair: applies official change files, keeps every legal baseline placement, minimises moves.
- **Official validator executed (unmodified):**
  - `exports/schedule.json` → **0 hard violations**, soft 3 (S4 only), bookings **65.5/70** (62–65.5 across optimal timetables), 21 approved / 2 alternatives / 2 rejected (1 cancelled + no 1200-seat venue exists), **0 priority inversions**, exam penalty 0.
  - `exports/schedule_after.json` (sample disruption) → **0 hard violations**, soft 3, **10 sessions moved** (5 time, 5 room-only), 190 sessions incl. the added tutorial. Repair objective = 3.0 ⇒ zero discretionary moves; every move is forced by the disruption.
- `engine/app.py` — FastAPI wrapper (`/health`, `/solve`, `/check`) for Render/Railway; `ENGINE_URL` switches the app to it.
- **pytest: 23/23 passing**, including the official end-to-end validator test and regression tests for the booking-override bugs (see docs/TESTING.md §6).

### Teacher coursework (new)
- **`/faculty/coursework`** — syllabus planner (units, topics, planned hours, covered toggles, reordering), **assignments/assessments** (assignment, quiz, project, lab; draft → published → closed; due dates, marks, groups) and **class resources** (link, note, file reference, reading; pinned). Create/edit/delete for all three, with instant progress metrics.
- **`/admin/coursework`** — oversight table for every course (coverage %, hours, assignments, resources, last update) plus full editing of any course.
- Permissions enforced server-side: a teacher can only manage courses they hold a teaching assignment for (`canManageCourse`); admins can manage any course. Publishing an assignment notifies the department coordinator; every change is audited (`syllabus.*`, `assignment.*`, `resource.*`).

### Timetable layout fix
- Fixed the “destroyed” timetable: the editor wrapped period rows in a plain `<div>` (making the whole row a single grid item, so row headers and day cells spilled into wrong columns), and both grids declared 10 of the 11 required row tracks. Rows are now emitted as fragments with correct tracks, the period rail no longer wraps, and the minimum width fits all five days (verified 730 px grid inside a 754 px column, headers aligned).

### Manual timetable scheduling
- **Admin editor** on Smart Scheduling: drag a class onto a free slot to move it, click "+" on any empty slot (or **Add class**) to schedule a class **for any teacher**, click a class to edit / pin / remove it. Auto-room assignment picks the smallest suitable free room; every add/move/delete is validated by the engine server-side, audited, and the teacher is notified.
- **Faculty → admin approval flow**: Schedule Change Requests now has a third option, **New extra class** — pick one of your courses, groups, and a slot (clickable **free-slot suggestions** computed from your timetable, your groups and your availability). The request goes to the **Admin's Approval Centre → New classes** tab; only the admin can approve it, the slot is re-validated on approval, and the class then appears on the live timetable. Coordinators keep handling reschedules/room changes for their department.
- Verified end-to-end through the live server actions: add ✓, clash rejected with explanation ✓, move ✓, extra-class request ✓, coordinator approval refused (admin-only) ✓, admin approval inserts the session ✓, delete ✓ — all with notifications and audit entries. Browser-tested: edit modal move (toast + close), add modal with prefilled teacher, 24 free-slot chips.
- Fixed: duplicate version labels after discarding a draft (now max-id based).

### Web application (Next.js, live in the sandbox)
- Premium emerald/charcoal design system, responsive shell, four role workspaces (Admin, Coordinator, Faculty, Club) with real auth, server-side role checks, notifications, audit history.
- **`/admin/official`** — official dataset overview, one-click CP-SAT generation and sample-disruption repair, the validator's own report rendered (hard/soft/bookings/stability), 9-period timetable grid by group/faculty/room with moved-session highlighting, booking decisions with reasons and role-cap notes, exam allocation table, per-run history, downloads of `schedule.json` / `schedule_after.json` / reports. Runs stored in `official_runs` + audit log.
- Demo workspaces (Westbrook dataset): timetables, validated manual changes, bookings with conflict checks and alternatives, disruptions, availability, rule-based assistant with strictly validated proposals.
- Sign-in works in normal tabs and embedded previews (partitioned cookies + cookie probe + direct-link fallback) — verified across Chromium/Firefox/WebKit.

## Honest gaps / next milestones

1. **Workspace migration to CIT data** — role dashboards still use the demo dataset; the official pipeline is a separate admin module. Next: import CIT entities into the main schema and repoint the grids (9+4 periods).
2. **Supabase credentials needed** — RLS migration written at `supabase/migrations/20261031000001_rls_policies.sql`. Needs the team's Supabase project URL, anon key, and service role key in `.env`. The app gracefully falls back to custom session auth when Supabase is not configured.
3. **Upload UI for arbitrary dataset/change files** (PS §2.9) — currently loads the official pack + sample disruption from `official/`.
4. **Hinglish/plain-English intake for CIT bookings** (PS §2.3) — parser exists for the demo workspace; wiring `raw_text` → CIT booking drafts is next.
5. **Manual edits on the CIT grid** (PS §2.10) — read-only; `check_assignment` is ready to gate edits.
6. **Per-session "why this slot" explanations** (PS §2.8) — booking reasons exist; solver-side explanations pending.
7. **Hosting** — Vercel + Supabase + Render need team accounts/keys (docs/DEPLOYMENT.md). Nothing is claimed deployed there yet; the sandbox preview is live.

### What was implemented in this session

- **Supabase Auth active**: Supabase project configured (`https://hzyuofkkewfxgzdfjfwx.supabase.co`) with anon key and service role key in `.env`. Dev server running on port 3000 with Supabase Auth as the authentication backend.
- **Four Supabase Auth users created**: admin@westbrook.edu (303533b5-8f63-4019-b862-d6fe7a1c5f48), coordinator.cse@westbrook.edu (8bfc836b-3bb3-4a43-8168-9ce3b2b70fc4), ananya.rao@westbrook.edu (2126d111-af8f-442f-ab57-722d681a399b), robotics@westbrook.edu (aa68e813-596f-4c68-9d64-d7056398d6ea). All with password `tessra123`, email-confirmed.
- **Local profiles linked**: `supabase_uid` column updated in local `users` table for all 4 demo accounts so post-login profile lookup works.
- **Hybrid auth mode**: Supabase Auth handles sign-in/session; local PostgreSQL handles all app data (users, courses, rooms, bookings, etc.). Graceful fallback to custom session cookies if Supabase is unavailable.
- **Supabase migration SQL**: Schema migration at `supabase_schema_migration.sql` (26 tables). Needs to be run in Supabase SQL Editor (sandbox can't reach Supabase PostgreSQL port due to IPv6-only address).
- **Access requests & account approval**: `/access-request` page for public registration. Admin reviews at `/admin/access-requests`.
- **Password reset**: `/auth/forgot-password` and `/auth/reset-password` with 1-hour time-limited tokens.
- **Pending account restriction**: Pending/rejected accounts blocked from protected routes.
- **RLS migration**: Complete Supabase RLS policies at `supabase/migrations/20261031000001_rls_policies.sql`.
- **CIT data migration**: All CrunchWeek Starter Pack CSV data imported into local PostgreSQL: 10 departments, 62 courses, 14 student groups, 40 faculty users, 27 rooms, 189 offerings, 95 availability blocks, 25 bookings, 38 total bookings, 41 rooms.
- **Server-side authorization**: `requireRole()` / `requireUser()` guards on all pages and actions.
- **TypeScript**: `npx tsc --noEmit` passes clean.
- **Build**: `npm run build` passes.
- **All tests pass**: Login (Supabase Auth), logout, session persistence, wrong password (401), demo accounts, access request flow, password reset API.## Repository map

```
engine/            CP-SAT engine (core.py), CLI (solve.py), FastAPI (app.py), pytest (tests/)
official/          untouched official starter pack + problem statement (+ extracted text)
exports/           app-produced schedule.json, schedule_after.json + validator reports
src/app            Next.js App Router (4 role workspaces, /admin/official, auth, exports API)
src/lib            auth, queries, server actions, demo engine, official integration
src/db             Drizzle schema (+ bootstrap SQL), PostgreSQL
docs/              requirements traceability, data dictionary, architecture, deployment, testing
AI_USAGE.md        full AI declaration (required by PS)
```
