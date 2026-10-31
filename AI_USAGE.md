# AI Usage Declaration — TESSRA

Declared as required by the official problem statement (§6). Undeclared AI use costs marks; this file lists everything.

## 1. AI inside the product

### What the product calls at runtime
**By default: no external LLM API is called.** The in-app “AI Assistant” (`/faculty/assistant`, `src/lib/assistant.ts`) is a deterministic, rule-based natural-language layer written by the team:

- Intent parsing (schedule questions, free rooms, workload, availability, reschedule proposals, request status, conflicts).
- Answers are computed from the live database, never generated text about imagined data.
- Reschedule/availability outputs are **proposals**: the scheduling code re-validates them server-side (`checkSessionMove`), the faculty member confirms, and a coordinator approves before anything changes.

An optional LLM provider can be configured later via environment variables (see `.env.example`); no provider key ships with the repo and no code path requires one. The manual booking form and every workflow work with zero AI configuration (PS §6 requirement).

### What the LLM / assistant is NOT allowed to decide
- Whether a timetable, booking, exam allocation or repair is **valid** — only deterministic code decides:
  - `engine/core.py::check_assignment` + the model's hard constraints (OR-Tools CP-SAT),
  - the organisers' `validator.py`, run unmodified on every official export,
  - server-side re-validation of every demo-workspace change (`src/lib/engine.ts`).
- Role/permission checks, priority order, category caps, cancellations — all deterministic code reading the official dataset.
- No AI output is written to the database without passing those checks and an explicit human confirmation/approval.

### Prompts
Rule-based intent patterns live in `src/lib/assistant.ts` (SUGGESTED_PROMPTS + parser). There are no hidden LLM prompts because no LLM is called by default. If a provider is added, its prompts must be committed under `docs/prompts/` and this file updated.

## 2. AI tools used while building

| Tool | What it helped with |
|---|---|
| Claude (Anthropic) coding agent, in the Arena sandbox | Generated and refactored most of the codebase: Next.js UI and design system, Drizzle schema, demo scheduling engine, the CP-SAT engine in `engine/`, tests, and documentation. All output was executed and verified in the sandbox (type checks, builds, pytest, the official validator, headless-browser checks). |

No other AI tools (image generators, UI generators, external code assistants) were used. No code was copied from other teams or pre-hackathon projects; the repository was built from an empty Next.js + Postgres starter during this event.

## 3. Models / APIs summary

| Where | Model/API | Purpose | Required? |
|---|---|---|---|
| Runtime | none (rule-based parser) | NL assistant over live data | no external service |
| Build time | Claude coding agent | code generation & review | declared above |

## 4. Validation boundary (architecture)

User request → parser/AI extraction → structured proposal → **deterministic validation** → user authorization → backend action → audit log.

The official pipeline never involves an LLM at all: dataset → CP-SAT solve → official validator → Admin review → export.
