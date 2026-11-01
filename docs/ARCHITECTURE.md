# TESSRA — Architecture

```
┌────────────────────────── Next.js (App Router, TypeScript strict) ─────────────────────────┐
│  4 role workspaces (Admin / Coordinator / Faculty / Club) + /admin/official                │
│  Server Components read via typed query layer (src/lib/queries.ts)                         │
│  Mutations: Server Actions + Route Handlers, Zod-style server validation, role guards      │
│  Auth: HttpOnly session cookie (SameSite=None; Secure; Partitioned on HTTPS)               │
└──────────────┬──────────────────────────────────────────────┬─────────────────────────────┘
               │ Drizzle ORM                                  │ official pipeline
        PostgreSQL (Supabase-ready)                    src/lib/official.ts
        demo workspace tables + official_runs                 │
                                                ┌─────────────┴────────────────────┐
                                                │ Production: private Vercel binding │
                                                │ ENGINE_URL → /solve-validated      │
                                                │ Local fallback: python3 solve.py   │
                                                └─────────────┬────────────────────┘
                                                              │
                                          engine/core.py — OR-Tools CP-SAT
                                          hard H1–H14 · soft S1–S6 (official weights)
                                          bookings (priority/caps/windows/overrides)
                                          exams (AM/PM, half capacity) · repairs
                                                              │
                                          byte-identical official validator copy
                                          report stored verbatim in official_runs
```

## Layers
- **UI**: `src/components` design system (tokens in `globals.css`), role shell, timetable grids.
- **Application**: `src/app/**` pages + `src/lib/*-actions.ts` server actions; every action starts with `requireRole(...)`. Targeted notices use the existing `notifications` rows as private per-recipient deliveries and `audit_logs` as campaign parents.
- **Domain**: demo engine (`src/lib/engine.ts`, `scheduler.ts`), deterministic operational-health scoring (`src/lib/campus-health.ts`), notice validation/audience policy (`src/lib/notices.ts`), and official integration (`src/lib/official.ts`, `official-actions.ts`).
- **Scheduling service**: `engine/` is standalone Python — CP-SAT model, deterministic booking/exam allocators, independent `check_assignment`, CLI + FastAPI. In production it is a private Vercel Python Service bound to the web service; it never touches the app database and receives only the submitted dataset/baseline/change data.
- **Validation authority**: the organisers' `validator.py`. The isolated deployment contains a byte-identical copy, enforced by regression test; `/solve-validated` returns its report with the schedule. The app stores and displays that report verbatim, and a run with violations is shown as invalid rather than hidden.

## Security model (current)
- Session cookies: random 256-bit tokens in `auth_sessions`, HttpOnly; over HTTPS `SameSite=None; Secure; Partitioned` so embedded previews work; cookie-probe endpoint detects blocked storage before sign-in.
- Authorization: server-side role checks on every page, action and export route; wrong role → redirect/403. Login route rejects cross-site posts (Sec-Fetch-Site/Origin).
- No public registration; demo accounts seeded; admin-created accounts are the production path.
- Secrets only via env (`DATABASE_URL`, `ENGINE_TOKEN`, future Supabase/AI keys). Nothing committed.

## Supabase target (when keys are provided)
- Move Postgres to Supabase; keep Drizzle for server access.
- Supabase Auth (email+password, no public sign-up) replaces `auth_sessions`; `profiles` table maps `auth.uid()` → role/department/club.
- RLS policies mirror the app guards: admin full; coordinator SELECT/UPDATE scoped to own department ids; faculty SELECT own timetable + own requests; club SELECT/INSERT own bookings; `audit_logs` INSERT-only for service role, no UPDATE/DELETE for anyone.
- Service-role key server-only; browser uses anon key + RLS.

## Key decisions
- Official priority, caps, cancellations and windows are read from the dataset — never hardcoded rankings.
- Bookings are allocated in strict priority order, so priority inversions are structurally avoided (validator confirms 0).
- Only institute events may displace classes, and every displaced session must pass `check_assignment` in its new slot before the override is emitted.
- Repairs use two CP-SAT phases: first minimize and prove the baseline-move count; then constrain that count to its optimum and minimize S1–S6. This is lexicographic, not an approximate weighted penalty.
- Uploaded base-dataset JSON is strictly schema/reference-validated before the private engine is called. Its parsed snapshot, source name, SHA-256, loader and load time are versioned inside the run; both solver and untouched validator consume that same snapshot.
- Uploaded change JSON is validated against the selected baseline snapshot. All five organiser change types are supported, and repair always reuses the immutable base version.
- A run carries namespaced internal `_dataset` and/or `_workflow` metadata inside its stored validator report. Exports strip both; proposal/rejection exports return HTTP 409, so only a separately approved Admin action can publish `schedule_after.json`.
- Operational booking-category ranks are a complete Admin-edited permutation. Approval and optional auto-approval defer overlapping same-venue requests when a higher-ranked (or earlier equal-ranked) request remains pending.
- Coordinator lab-booking actions re-check that the requested and suggested rooms are labs owned by the authenticated coordinator’s department before writing, notifying, and auditing.
- Notice publication is server-authorized and atomic: Admins may choose role/department audiences, while Coordinator input is ignored for scope and forcibly bound to the authenticated account’s department. Only approved non-Admin recipients receive a private row; acknowledgement updates are constrained by both notification ID and current user ID.
- Notice campaigns intentionally reuse the existing schema. A strict non-navigable `notice:v1:<audit-id>:<category>:<audience>:<department>` marker in `notifications.href` links delivery rows to their `notice.published` audit event; normal links remain unaffected. This avoids a production database migration.
- Campus health is a read-only request-time projection over existing tables. Six independently scored indicators expose their raw values, sources, weights and formulas; the overall value is a normalized weighted mean of only the indicators with real source data. It sends no data to an AI or external analytics service.
