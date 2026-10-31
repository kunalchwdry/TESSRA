# TESSRA — Intelligent Campus ERP

**Smarter Schedules. Seamless Campus Operations.**

Built for the Crunch Week problem statement (Chilika Institute of Technology): timetable generation, Spectra-week venue bookings, midsem exams and disruption repair — with an OR-Tools CP-SAT engine graded by the organisers' own validator.

## Live demo & accounts

Live link: the sandbox preview URL (see submission). No public registration — use these demo accounts (password for all: `tessra123`):

| Role | Email |
|---|---|
| Admin (Dean's office) | `admin@westbrook.edu` |
| Department Coordinator | `coordinator.cse@westbrook.edu` |
| Faculty | `ananya.rao@westbrook.edu` |
| Club Representative | `robotics@westbrook.edu` |

**Judges' path:** sign in as Admin → **Official Dataset (CIT)** in the sidebar → **Generate schedule** (CP-SAT, ~30 s) → the official validator's report appears (0 hard violations) → browse the timetable by group/faculty/room, booking decisions with reasons, exam allocation → download `schedule.json`. Then **Apply sample disruption** → repaired timetable with moved sessions highlighted → download `schedule_after.json`.

If the embedded preview panel blocks cookies (Safari/iOS), the sign-in screen shows a direct link — open it in its own tab.

## Official results (validator.py, unmodified)

| Export | Hard violations | Soft | Bookings | Stability |
|---|---|---|---|---|
| `exports/schedule.json` | **0** | 3 | 65.5 / 70 · 0 inversions | — |
| `exports/schedule_after.json` | **0** | 3 | — | 10 sessions moved |

Both files are produced by the app's engine, never by hand. Reports: `exports/report*.json`.
The booking score depends on which optimal timetable CP-SAT finds (62–65.5 observed across runs); hard violations and priority inversions are 0 in every run, and the two legitimate rejections are the cancelled BR-04 and BR-09 (needs 1,200 seats; the largest venue holds 800).

## Quick start

```bash
npm install
cp .env.example .env             # defaults work in the sandbox
python3 -m pip install ortools fastapi "uvicorn[standard]" pytest
npx drizzle-kit push             # schema (app also self-bootstraps an empty DB)
npm run dev                      # or: npm run build && npm start

# official pipeline from the CLI (same code the app runs)
python3 engine/solve.py --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json --out exports/schedule.json
python3 official/starterpack/CrunchWeek_StarterPack/validator.py \
  --data official/starterpack/CrunchWeek_StarterPack/data/cit_public.json --schedule exports/schedule.json

# tests
python3 -m pytest engine/tests -q     # 23 tests incl. official end-to-end + constraint regressions
npm exec tsc -- --noEmit && npm run build && npx eslint .
```

### Supabase setup (production)

TESSRA supports two auth modes:

1. **Custom session auth (default, no setup needed)** — works out of the box with
   local PostgreSQL. Demo accounts are seeded automatically.
2. **Supabase Auth (recommended for production)** — set these in `.env`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-only
   DATABASE_URL=your-supabase-postgres-connection-string
   ```

   Then run the RLS migration:
   ```
   psql $DATABASE_URL < supabase/migrations/20261031000001_rls_policies.sql
   ```

   With Supabase configured, the app uses Supabase Auth for sign-in/sign-up,
   session persistence, and password reset. Custom session cookies are disabled.

## Demo accounts (password for all: `tessra123`)

| Role | Email |
|------|-------|
| Admin (Dean's office) | `admin@westbrook.edu` |
| Department Coordinator | `coordinator.cse@westbrook.edu` |
| Faculty | `ananya.rao@westbrook.edu` |
| Club Representative | `robotics@westbrook.edu` |

New users can also request access at `/access-request`. An admin must approve
the request before the account can sign in.

Next.js (App Router) · TypeScript strict · Tailwind · PostgreSQL + Drizzle (Supabase-ready) · Python FastAPI + **Google OR-Tools CP-SAT** (`engine/`, deploy separately; `ENGINE_URL`) · Lucide icons.

## Repository
- `engine/` — CP-SAT model (hard H1–H14, soft S1–S6 with official weights), bookings (official priority/caps/cancellations), exams (half capacity), minimal-move repairs, CLI + FastAPI + pytest
- `official/` — untouched starter pack + problem statement
- `exports/` — app-produced `schedule.json`, `schedule_after.json`, validator reports
- `src/` — four role workspaces, `/admin/official` pipeline UI, auth, audit, notifications
- **Coursework** — teachers plan syllabus, assignments and resources per course; admins oversee and edit all courses
- **Manual scheduling** — admin drag-and-drop editor (add/move/pin/remove classes for any teacher) and faculty extra-class requests with free-slot suggestions, approved by the admin in the Approval Centre
- `docs/` — REQUIREMENTS_TRACEABILITY · DATA_DICTIONARY · ARCHITECTURE · DEPLOYMENT · TESTING
- `AI_USAGE.md` — full AI declaration (runtime assistant is deterministic; no LLM required)
- `IMPLEMENTATION_STATUS.md` — exactly what works, what's tested, what's pending

## Known limitations
Role dashboards currently run on a demo dataset while the official CIT pipeline lives in `/admin/official`; Supabase Auth/RLS and Vercel/Render hosting are prepared but need team accounts (docs/DEPLOYMENT.md). Details in IMPLEMENTATION_STATUS.md.
