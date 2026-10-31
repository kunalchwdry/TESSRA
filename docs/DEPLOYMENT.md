# TESSRA — Deployment Guide

Honest status: the app runs in the sandbox preview. Vercel / Supabase / Render deployment **has not been executed** — it needs the team's accounts and keys. Everything below is prepared so it's a configuration task, not a code task.

## 1. What the team must provide
| Service | Needed | Used for |
|---|---|---|
| GitHub | public repo push access | judges must open the repo (PS §9) |
| Supabase | project URL, anon key, service-role key, DB password | Postgres + Auth + RLS |
| Vercel | account + project import | Next.js frontend |
| Render / Railway | account | FastAPI + OR-Tools engine (`engine/`) |
| (optional) LLM provider | API key | assistant upgrade; not required |

## 2. Scheduling service (Render/Railway)
1. Root directory `engine/`, Python 3.11+.
2. `pip install ortools fastapi uvicorn pydantic` (requirements: see below).
3. Start: `uvicorn app:app --host 0.0.0.0 --port $PORT`.
4. Env: `ENGINE_TOKEN` (shared secret), `ENGINE_ALLOWED_ORIGINS=https://<vercel-domain>`.
5. Health check: `GET /health` → `{"ok": true, "engine": "cp-sat", ...}`.

`engine/requirements.txt`:
```
ortools>=9.10
fastapi>=0.110
uvicorn[standard]>=0.29
pydantic>=2
```

## 3. Database (Supabase)
1. Create project; run the Drizzle schema (`npx drizzle-kit push` with the Supabase `DATABASE_URL`) or apply `src/db/bootstrap-sql.ts` statements.
2. Seed: first app boot self-seeds demo data; official dataset ships in `official/` and is read at runtime.
3. When switching to Supabase Auth: create users in the dashboard (no public sign-up), map roles in a `profiles` table, apply the RLS policies described in docs/ARCHITECTURE.md. Until then the built-in session auth works against Supabase Postgres unchanged.

## 4. Frontend (Vercel)
1. Import the GitHub repo, framework Next.js (build `next build`).
2. Env vars: `DATABASE_URL` (Supabase pooler), `ENGINE_URL` (Render URL), `ENGINE_TOKEN`, optionally Supabase/AI keys from `.env.example`.
3. **Important**: with `ENGINE_URL` set, solves run on the engine service — never in Vercel functions. Without it, the app tries a local `python3` subprocess, which serverless hosts don't provide; set `ENGINE_URL` in production.
4. `official/` and `engine/` must be included in the deployment (they are in the repo; Vercel ships them as files for the validator subprocess — if the host forbids subprocesses entirely, run validation on the engine service instead; the `/check` endpoint plus reports stored per-run keep the evidence trail).

## 5. Verification after deploy
- `/api/health` → `{"ok":true}`; engine `/health` → ok.
- Sign in with the README demo accounts; open `/admin/official`, press **Generate schedule**, confirm the validator report shows 0 hard violations, download `schedule.json`.
- Press **Apply sample disruption**, confirm stability ≈ 9 moved, download `schedule_after.json`.
- Re-run `python validator.py` locally on the downloads for independent proof.

## 6. Repo checklist for judging (PS §9)
- [ ] Public GitHub repo, commits during the hackathon window
- [ ] `exports/schedule.json` + `exports/schedule_after.json` (app-produced) committed
- [ ] README with live link + working demo accounts
- [ ] AI_USAGE.md present (done)
- [ ] Demo video showing the working site
