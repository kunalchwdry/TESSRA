# TESSRA — Requirements Traceability

Sources inspected (downloaded from the links supplied by the team, saved under `official/`):

- **PS** — `Problem-statement.pdf` (6 pages, “Campus Scheduling and Venue Management”, Chilika Institute of Technology)
- **README** — `CrunchWeek_StarterPack/README.md`
- **DATA** — `data/cit_public.json` (+ CSV mirrors), verified counts: 27 rooms, 40 faculty, 14 groups, 62 courses, 189 sessions (243 h), 25 booking requests (1 cancelled), 41 exams
- **VAL** — `validator.py` (513 lines, run unmodified)

Status legend: ✅ done & tested · 🟡 partial (gap described) · ⬜ not built yet.
No official file has been modified. Nothing below claims validator compatibility without an executed run (`docs/TESTING.md` has the evidence).

## A. Core platform capabilities (PS §2)

| ID | Requirement (source) | Implementation | Test / evidence | Status |
|---|---|---|---|---|
| PS-1 | Weekly timetable for every session, no clashes (PS §2.1) | `engine/core.py::solve_timetable` (CP-SAT), 189/189 placed | `test_official_dataset_passes_official_validator`; VAL: 0 hard | ✅ |
| PS-2 | Midsem exams for the following week (PS §2.2) | `engine/core.py::allocate_exams` — AM/PM, half capacity, multi-room | VAL exam section: 0 violations, soft 0 | ✅ |
| PS-3 | Plain-English/Hinglish requests → structured booking → user edits → submit (PS §2.3) | `src/lib/booking-parser.ts` + `/api/club/parse-booking` fill the real editable booking form, expose assumptions/follow-ups, detect recurrence/priority abuse, select compatible venues, then reuse `createBookingAction` validation | `npm run test:parser` (7 cases, including UTC/IST boundary) + production build | ✅ |
| PS-4 | Approve/reject/alternative per Spectra request with reason, official priority (PS §2.4, §4) | `engine/core.py::allocate_bookings` — role caps, priority order, tie by `submitted_at`, cancellations, reasons on every non-approval | VAL: score 65.5/70 (62–65.5 across optimal timetables), 0 priority inversions, reasons present | ✅ |
| PS-5 | Disruptions: minimal moves, show diff, Admin approval, explain infeasibility (PS §2.5) | Engine repair keeps legal baseline placements (`move_penalty`), `/admin/official` shows moved badges + stability; infeasibility reasons from `infeasibility_reasons`. Admin approval gate exists in demo workspace; official repair applies on explicit Admin button press | VAL `--disruption --baseline`: 0 hard, soft 3, 8 moved (2 time, 6 room-only) | ✅ |
| PS-6 | Views by group / faculty / room + approvals, conflicts, utilisation (PS §2.6) | Official: `/admin/official` 9-period grid with 3 filters. Demo workspaces: full dashboards | Route checks + browser matrix | ✅ |
| PS-7 | Faculty AI assistant, strictly validated proposals (PS §2.7) | `/faculty/assistant`: optional OpenAI-compatible/Anthropic JSON intent proposal (`src/lib/llm.ts`), strict sanitisation, deterministic alternative search, submit-time revalidation and coordinator approval; deterministic fallback on provider failure | typecheck/build + server-side proposal checks | ✅ |
| PS-8 | Explain decisions (why 8 AM, why rejected) (PS §2.8) | Booking decisions carry machine-written reasons; solver objective documented; assistant explains conflicts | VAL reasons column | 🟡 (no per-session “why this slot” explainer yet) |
| PS-9 | Admin loads dataset/change files, exports schedule.json (PS §2.9) | `/admin/official` reads official pack, runs engine + validator, downloads `schedule.json` / `schedule_after.json`; `exports/` written by the app | Export downloads tested | 🟡 (upload of arbitrary dataset/change files not yet — fixed official pack + sample disruption) |
| PS-10 | Manual scheduling by authorized roles, hard constraints enforced (PS §2.10) | Demo workspace: full admin editor (drag-drop moves, add class for any teacher, edit/pin/remove) + faculty extra-class requests in free slots approved by the admin — every change validated server-side (`validateDraftSession`, `checkSessionMove`, `findFreeRoom`). Official CIT grid is read-only | Live action tests: add/move/delete/clash-rejection/extra-class approval incl. admin-only guard; browser tests of editor + free-slot picker | ✅ (demo) / 🟡 (CIT grid) |

## B. Hard constraints (PS §3, VAL rules)

All modelled in `engine/core.py::solve_timetable` and independently re-checked by `check_assignment` and the official validator.

| Rule | Constraint | Model | Unit test |
|---|---|---|---|
| H1 | every session exactly once, valid ids | `AddExactlyOne` per session | end-to-end (189 placed) |
| H2 | faculty no clash | `AddAtMostOne` per (fac,day,period) | `test_h2_faculty_no_clash` |
| H3 | group no clash; baskets exempt within slot | occupancy with basket representative | `test_h3…`, `test_h11…` |
| H4 | room no double booking | `AddAtMostOne` per (room,day,period) | `test_h4…` |
| H5 | capacity (halved for exams) | room filter; exam allocator uses `cap//2` | `test_h5…`, `test_exams_half_capacity…` |
| H6 | room type + allowed_uses | room filter | `test_h5_capacity_and_h6_type…` |
| H7 | faculty unavailability | slot filter | `test_h7…` |
| H8 | room unavailability | combo filter | `test_h8…` |
| H9 | no lunch span; labs P2–P4 / P6–P8 only | slot filter | `test_h9_lab_starts_and_lunch` |
| H10 | accessible rooms where needed | room filter | `test_h5…h10…` |
| H11 | basket slot same day+period, different rooms | shared time booleans | `test_h11_basket…` |
| H12 | faculty daily hour limit | per (fac,day) sum ≤ limit | `test_h12_daily_limit` |
| H13 | approved booking clashes nothing | allocator checks week timetable + bookings + mandatory groups | `test_booking_must_respect…`; VAL 0 |
| H14 | fixed slots stay | slot filter | `test_h14_fixed_slot_stays` |

## C. Soft constraints (official weights, objective = validator score)

| Rule | Penalty | Model |
|---|---|---|
| S1 | 2/h in avoided day+period | cost on assignment vars |
| S2 | 1 per group gap (lunch not a period) | before/after/gap booleans per group-day |
| S3 | 3 per hour beyond 6/day | overflow IntVar |
| S4 | 3 per repeat course/day (incl. baskets) | count−1 overflow |
| S5 | 1 if size/capacity < 40% | room-choice cost |
| S6 | 1 per P9 hour | assignment cost |

Latest official run: **S1 0 · S2 0 · S3 0 · S4 3 · S5 0 · S6 0 → total 3** (optimal).

## D. Roles & priority (PS §4)

| ID | Requirement | Implementation | Status |
|---|---|---|---|
| R-1 | Exactly 4 roles | demo workspaces + `role_category_cap` in engine | ✅ |
| R-2 | Nobody approves their own request | demo: reviewer ≠ requester enforced server-side for bookings/changes. Official allocator is a batch Admin action | 🟡 (self-approval check not applicable to batch, documented) |
| R-3 | Priority: exams > classes > institute > guest > department > club; ties by submission | `allocate_bookings` sorts by effective category then `submitted_at`; classes occupy rooms before bookings; only institute events displace classes via `session_overrides` | ✅ (VAL inversions 0) |
| R-4 | Role category caps | `effective_category` mirrors validator | ✅ `test_booking_priority_cap_and_tiebreak` |
| R-5 | Cancelled never approved | allocator rejects with reason | ✅ `test_booking_cancelled_never_approved` |
| R-6 | Admin can change priority order | not built (order read from dataset) | ⬜ |
| R-7 | Coordinator approves own department's labs | demo workspace has department-scoped approvals; CIT-specific lab approval routing not built | 🟡 |

## E. Implementation rules & judging (PS §6–§8)

| ID | Requirement | Status |
|---|---|---|
| J-1 | AI_USAGE.md declaring all AI use | ✅ `AI_USAGE.md` |
| J-2 | LLM never decides validity; deterministic checks | ✅ validator + `check_assignment`; assistant proposals re-validated |
| J-3 | Manual booking form works without any LLM | ✅ no LLM dependency anywhere by default |
| J-4 | exports/schedule.json + schedule_after.json produced by the app | ✅ generated by `engine/solve.py`; validator reports: 0 hard / soft 3, repair 8 moves |
| J-5 | Public repo, live link, demo accounts in README, video | 🟡 public repo, live Vercel link and all four accounts documented/verified; video link remains a submission-owner action |

## F. Known gaps (honest list)

1. **Two data worlds.** The four role workspaces use the compact “Westbrook” demo dataset (8×50-minute periods); the full CIT 9+4-period pipeline, baskets, official bookings/exams and validator report live in `/admin/official` + `engine/`.
2. **Arbitrary dataset/disruption upload** (PS-9) — the committed UI loads the official pack and sample disruption; upload of a replacement JSON file is not yet exposed.
3. **Manual edits on the CIT grid** (PS-10) — the CIT grid is read-only; manual edits in the demo workspace are checked server-side.
4. **“Why this slot” explanations** (PS-8) — booking rejection/alternative reasons and assistant conflict explanations exist, but there is no full per-variable CP-SAT proof explanation for every class placement.
5. **Serverless CP-SAT execution** — production generation requires `ENGINE_URL` for the included FastAPI engine; local environments can use the Python subprocess fallback.
