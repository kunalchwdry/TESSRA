import { CalendarDays, ClipboardList, Download, FlaskConical, History, Play, ShieldCheck, Ticket, TriangleAlert, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { AutoSubmitSelect, ActionForm, SubmitButton } from "@/components/client";
import { KIND_STYLE } from "@/components/timetable";
import { Badge, Button, ButtonLink, Callout, Card, CardBody, CardHeader, EmptyState, PageHeader, ProgressBar, StatCard, StatusBadge, TabLinks, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { officialRuns, type OfficialRunRow } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { applyOfficialDisruptionAction, generateOfficialScheduleAction } from "@/lib/official-actions";
import { effectiveCategory, getOfficialDataset, type OfficialDataset, type OfficialSchedule, type ValidatorReport } from "@/lib/official";
import { qs, readParams, type SearchParams } from "@/lib/params";
import { cn, formatRelative, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Official Dataset (CIT)" };
/** CP-SAT usually finishes in ~25s; allow cold-start and validator headroom. */
export const maxDuration = 240;

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI"];
const KIND_LABEL = { lecture: "Lecture", tutorial: "Tutorial", lab: "Lab" } as const;

type Placement = { session_id: string; day: string; start_period: number; room_id: string };

function OfficialGrid({ data, placements, movedIds, addedIds }: { data: OfficialDataset; placements: Placement[]; movedIds?: Set<string>; addedIds?: Set<string> }) {
  const sessions = new Map(data.sessions.map((s) => [s.id, s]));
  const rowFor = (p: number) => (p <= 5 ? p + 1 : p + 2);
  const clusters = DAY_ORDER.map((day) => {
    const list = placements.filter((p) => p.day === day).sort((a, b) => a.start_period - b.start_period);
    const out: { start: number; end: number; items: Placement[] }[] = [];
    for (const p of list) {
      const dur = sessions.get(p.session_id)?.duration ?? 1;
      const end = p.start_period + dur - 1;
      const last = out[out.length - 1];
      if (last && p.start_period <= last.end) {
        last.items.push(p);
        last.end = Math.max(last.end, end);
      } else out.push({ start: p.start_period, end, items: [p] });
    }
    return out;
  });
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="grid min-w-[820px]" style={{ gridTemplateColumns: "76px repeat(5, minmax(0,1fr))", gridTemplateRows: "40px repeat(5, minmax(72px,auto)) 28px repeat(4, minmax(72px,auto))" }} role="grid" aria-label="Official weekly timetable">
        <div className="border-b border-r border-line bg-subtle" style={{ gridColumn: 1, gridRow: 1 }} />
        {DAY_ORDER.map((d, i) => (
          <div key={d} role="columnheader" className={cn("flex items-center px-3 text-[13px] font-semibold text-ink border-b border-line bg-subtle", i < 4 && "border-r")} style={{ gridColumn: i + 2, gridRow: 1 }}>
            {d}
          </div>
        ))}
        {data.calendar.periods.filter((p) => p.teaching).map((p) => (
          <div key={p.id}>
            <div role="rowheader" className="sticky left-0 z-10 flex h-full flex-col justify-center border-b border-r border-line bg-surface px-3" style={{ gridColumn: 1, gridRow: rowFor(p.id) }}>
              <span className="text-[13px] font-semibold text-ink">P{p.id}</span>
              <span className="tabular text-[11px] text-ink-3">{p.start}</span>
            </div>
            {DAY_ORDER.map((_, d) => (
              <div key={d} className={cn("border-b border-line", d < 4 && "border-r")} style={{ gridColumn: d + 2, gridRow: rowFor(p.id) }} />
            ))}
          </div>
        ))}
        <div className="sticky left-0 z-10 flex items-center border-b border-r border-line bg-subtle px-3 text-[11px] font-medium text-ink-3" style={{ gridColumn: 1, gridRow: 7 }}>Lunch</div>
        <div className="flex items-center justify-center border-b border-line bg-subtle text-[11px] font-medium text-ink-3" style={{ gridColumn: "2 / span 5", gridRow: 7 }}>
          {data.calendar.lunch.start}–{data.calendar.lunch.end}
        </div>
        {clusters.flatMap((dayClusters, day) =>
          dayClusters.map((cluster) => (
            <div key={`${day}-${cluster.start}`} className="relative z-[1] flex min-w-0 gap-1 p-1" style={{ gridColumn: day + 2, gridRow: `${rowFor(cluster.start)} / ${rowFor(cluster.end) + 1}` }}>
              {cluster.items.map((p) => {
                const s = sessions.get(p.session_id);
                if (!s) return null;
                const style = KIND_STYLE[s.kind];
                const compact = cluster.items.length > 1;
                return (
                  <div key={p.session_id} className={cn("flex h-full min-w-0 flex-1 flex-col rounded-lg border border-transparent border-l-[3px] p-1.5", style.card)} title={`${s.id} · ${s.groups.join(" + ")} · ${s.faculty_id} · ${p.room_id}${s.basket_slot ? ` · basket ${s.basket_slot}` : ""}`}>
                    <span className={cn("truncate text-[11.5px] font-semibold leading-4", style.text)}>{s.course_id}</span>
                    {!compact && <span className="truncate text-[10.5px] text-ink-2">{s.groups.join("+")}</span>}
                    <span className="truncate text-[10.5px] text-ink-2">{p.room_id} · {s.faculty_id}</span>
                    <span className="mt-auto flex flex-wrap gap-1 pt-0.5">
                      {s.basket_slot && <span className="rounded bg-surface/85 px-1 text-[9.5px] font-medium text-ink-2 ring-1 ring-line">{s.basket_slot}</span>}
                      {s.duration > 1 && <span className="rounded bg-surface/85 px-1 text-[9.5px] font-medium text-ink-2 ring-1 ring-line">{s.duration}h</span>}
                      {movedIds?.has(p.session_id) && <span className="rounded bg-warning-bg px-1 text-[9.5px] font-semibold text-warning-fg">Moved</span>}
                      {addedIds?.has(p.session_id) && <span className="rounded bg-brand-100 px-1 text-[9.5px] font-semibold text-brand-800">New</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function ReportPanel({ report, schedule }: { report: ValidatorReport; schedule: OfficialSchedule }) {
  const b = report.bookings;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          icon={report.hard_violation_count === 0 ? ShieldCheck : TriangleAlert}
          title="Official validator report"
          description="Output of the organisers' validator.py, run unmodified on this export"
          action={<Badge tone={report.hard_violation_count === 0 ? "success" : "danger"}>{report.hard_violation_count} hard violations</Badge>}
        />
        <CardBody className="space-y-4">
          {report.hard_violation_count > 0 && (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg bg-danger-bg/30 p-3 text-xs text-danger-fg ring-1 ring-danger-bg-strong">
              {report.hard_violations.slice(0, 30).map((v, i) => (
                <li key={i}><span className="font-semibold">[{v.rule}]</span> {v.detail}</li>
              ))}
            </ul>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-2">Soft penalties (official weights)</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.soft_penalties).map(([k, v]) => (
                <span key={k} className={cn("tabular rounded-lg px-2.5 py-1 text-xs font-medium ring-1", v > 0 ? "bg-warning-bg/60 text-warning-fg ring-warning-bg" : "bg-subtle text-ink-2 ring-line")}>
                  {k} · {v}
                </span>
              ))}
              <span className="tabular rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white">Total {report.soft_total}</span>
              {report.exam_soft_penalty !== undefined && (
                <span className="tabular rounded-lg bg-subtle px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">Exams · {report.exam_soft_penalty}</span>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-ink-3">S1 avoided-slot teaching ×2 · S2 group gaps · S3 &gt;6h days ×3 · S4 repeated course ×3 · S5 &lt;40% room use · S6 P9 classes</p>
          </div>
          {report.stability && (
            <Callout tone="brand" title={`Stability: ${report.stability.sessions_moved} sessions moved`}>
              {report.stability.time_changed} changed time · {report.stability.room_only_changed} room-only changes. The repair keeps every legal baseline placement.
            </Callout>
          )}
          {report.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning-fg">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
        </CardBody>
      </Card>
      <div className="space-y-4">
        {b && (
          <Card>
            <CardHeader icon={Ticket} title="Spectra week bookings" />
            <CardBody className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs text-ink-2">
                  <span>Booking score</span>
                  <span className="tabular font-semibold text-ink">{b.booking_score} / {b.booking_score_max_if_all_approved}</span>
                </div>
                <ProgressBar value={b.booking_score} max={b.booking_score_max_if_all_approved} label="Booking score" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([["Approved", b.approved, "text-success-fg"], ["Alternatives", b.alternatives, "text-info-fg"], ["Rejected", b.rejected, "text-danger-fg"]] as const).map(([k, v, c]) => (
                  <div key={k} className="rounded-lg bg-subtle px-2 py-2 ring-1 ring-line">
                    <p className={cn("tabular text-lg font-semibold", c)}>{v}</p>
                    <p className="text-[11px] text-ink-2">{k}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-2">
                {b.session_overrides} session override{b.session_overrides === 1 ? "" : "s"} ·{" "}
                <span className={b.priority_inversions.length ? "font-semibold text-danger-fg" : "text-success-fg"}>{b.priority_inversions.length} priority inversions</span>
              </p>
              {b.priority_inversions.map((i) => <p key={i} className="text-xs text-danger-fg">{i}</p>)}
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader icon={FlaskConical} title="Solver" />
          <CardBody className="text-[13px] text-ink-2">
            <p><span className="font-medium text-ink">Engine:</span> Google OR-Tools CP-SAT</p>
            <p><span className="font-medium text-ink">Status:</span> {schedule.solver?.status ?? "—"}</p>
            {schedule.solver?.objective != null && <p><span className="font-medium text-ink">Objective:</span> {schedule.solver.objective}</p>}
            {schedule.solver?.wall_time != null && <p><span className="font-medium text-ink">Solve time:</span> {schedule.solver.wall_time}s</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default async function OfficialPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const get = await readParams(searchParams);
  const data = await getOfficialDataset();
  const runs = await db.select().from(officialRuns).orderBy(desc(officialRuns.id)).limit(20);
  const run: OfficialRunRow | null = runs.find((r) => String(r.id) === get("run")) ?? runs[0] ?? null;
  const schedule = run ? (run.schedule as unknown as OfficialSchedule) : null;
  const report = run ? (run.report as unknown as ValidatorReport) : null;
  const tab = (["timetable", "bookings", "exams"] as const).find((t) => t === get("tab")) ?? "timetable";
  const baselineRun = runs.find((r) => r.kind === "schedule");
  const movedIds = new Set<string>();
  const addedIds = new Set<string>();
  if (run?.kind === "disruption" && baselineRun) {
    const base = new Map((baselineRun.schedule as unknown as OfficialSchedule).sessions.map((s) => [s.session_id, `${s.day}|${s.start_period}|${s.room_id}`]));
    for (const s of schedule?.sessions ?? []) {
      if (!base.has(s.session_id)) addedIds.add(s.session_id); // added by the change file — not a "move"
      else if (base.get(s.session_id) !== `${s.day}|${s.start_period}|${s.room_id}`) movedIds.add(s.session_id);
    }
  }

  const generateBtn = (
    <ActionForm action={generateOfficialScheduleAction} className="inline-flex">
      <SubmitButton icon={<Play />} pendingLabel="Solving with CP-SAT (up to 90s)…">Generate schedule</SubmitButton>
    </ActionForm>
  );
  const repairBtn = (
    <ActionForm action={applyOfficialDisruptionAction} className="inline-flex">
      <SubmitButton variant="secondary" icon={<Wrench />} pendingLabel="Repairing (up to 90s)…" disabled={!baselineRun}>
        Apply sample disruption
      </SubmitButton>
    </ActionForm>
  );

  // timetable filter
  const view = (["group", "faculty", "room"] as const).find((v) => v === get("view")) ?? "group";
  const options = view === "group" ? data.student_groups.map((g) => ({ id: g.id, label: `${g.id} · ${g.name}` }))
    : view === "faculty" ? data.faculty.map((f) => ({ id: f.id, label: `${f.id} · ${f.name}` }))
    : data.rooms.map((r) => ({ id: r.id, label: `${r.id} · ${r.name}` }));
  const entityId = options.find((o) => o.id === get("id"))?.id ?? options[0]?.id ?? "";
  const sessionMap = new Map(data.sessions.map((s) => [s.id, s]));
  const placements = (schedule?.sessions ?? []).filter((p) => {
    const s = sessionMap.get(p.session_id);
    if (!s) return false;
    return view === "group" ? s.groups.includes(entityId) : view === "faculty" ? s.faculty_id === entityId : p.room_id === entityId;
  });

  // Repair exports carry only the timetable; show the baseline run's decisions/exams, clearly labelled.
  const showingBaseline = run?.kind === "disruption" && Boolean(baselineRun);
  const decisionsSchedule = showingBaseline ? (baselineRun!.schedule as unknown as OfficialSchedule) : schedule;
  const decBy = new Map((decisionsSchedule?.fest_week?.bookings ?? []).map((b) => [b.request_id, b]));
  const cancelled = new Set(data.cancellations.map((c) => c.request_id));
  const sortedRequests = [...data.booking_requests].sort((a, b) =>
    data.priority_order.indexOf(effectiveCategory(data, a)) - data.priority_order.indexOf(effectiveCategory(data, b)) || a.submitted_at.localeCompare(b.submitted_at));
  const examRooms = new Map(data.rooms.map((r) => [r.id, r]));
  const examMap = new Map(data.exams.map((e) => [e.id, e]));

  return (
    <>
      <PageHeader
        eyebrow={`Crunch Week · ${data.institute} · ${data.dataset_id}`}
        title="Official Dataset (CIT)"
        description="The untouched official starter-pack dataset, solved by the OR-Tools CP-SAT engine and graded by the organisers' own validator. Exports are produced by the app, never by hand."
        actions={<>{repairBtn}{generateBtn}</>}
        meta={
          <>
            {[["Rooms", data.rooms.length], ["Faculty", data.faculty.length], ["Groups", data.student_groups.length], ["Courses", data.courses.length], ["Sessions", data.sessions.length], ["Bookings", data.booking_requests.length], ["Exams", data.exams.length]].map(([k, v]) => (
              <span key={k} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">{k} <span className="tabular font-semibold text-ink">{v}</span></span>
            ))}
          </>
        }
      />

      {!run || !schedule || !report ? (
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="No official run yet"
            description="Generate the CIT timetable, Spectra-week booking decisions and the 41 midsem exams. The official validator runs automatically on the result."
            action={generateBtn}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <Badge tone={run.kind === "schedule" ? "brand" : "warning"}>{run.kind === "schedule" ? "Baseline schedule" : "After sample disruption"}</Badge>
                <span className="font-semibold text-ink">{run.label}</span>
                <span>· {formatRelative(run.createdAt)}</span>
                <StatusBadge status={report.hard_violation_count === 0 ? "approved" : "rejected"} />
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/api/export/official?run=${run.id}`} variant="secondary" size="sm" prefetch={false}>
                  <Download aria-hidden /> {run.kind === "disruption" ? "schedule_after.json" : "schedule.json"}
                </ButtonLink>
                <ButtonLink href={`/api/export/official?run=${run.id}&file=report`} variant="ghost" size="sm" prefetch={false}>
                  <Download aria-hidden /> Validator report
                </ButtonLink>
              </div>
            </div>
          </Card>

          <ReportPanel report={report} schedule={schedule} />

          <div>
            <TabLinks
              label="Official results"
              items={[
                { href: qs("/admin/official", { run: run.id, tab: "timetable", view, id: entityId }), label: "Timetable", count: schedule.sessions.length, active: tab === "timetable" },
                { href: qs("/admin/official", { run: run.id, tab: "bookings" }), label: "Spectra bookings", count: decisionsSchedule?.fest_week ? data.booking_requests.length : 0, active: tab === "bookings" },
                { href: qs("/admin/official", { run: run.id, tab: "exams" }), label: "Midsem exams", count: decisionsSchedule?.exams?.length ?? 0, active: tab === "exams" },
              ]}
            />
          </div>

          {tab === "timetable" && (
            <Card>
              <div className="border-b border-line p-4 sm:p-5">
                <Form action="/admin/official" className="flex flex-wrap items-end gap-3" aria-label="Timetable filters">
                  <input type="hidden" name="run" value={run.id} />
                  <input type="hidden" name="tab" value="timetable" />
                  <div className="w-full sm:w-44">
                    <label htmlFor="view" className="mb-1.5 block text-xs font-medium text-ink-2">View by</label>
                    <AutoSubmitSelect id="view" name="view" defaultValue={view} key={`v-${view}`}>
                      <option value="group">Student group</option>
                      <option value="faculty">Faculty</option>
                      <option value="room">Room</option>
                    </AutoSubmitSelect>
                  </div>
                  <div className="w-full sm:w-80">
                    <label htmlFor="id" className="mb-1.5 block text-xs font-medium text-ink-2">Entity</label>
                    <AutoSubmitSelect id="id" name="id" defaultValue={entityId} key={`i-${view}-${entityId}`}>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </AutoSubmitSelect>
                  </div>
                  <p className="pb-2 text-xs text-ink-3">{placements.length} sessions{movedIds.size || addedIds.size ? ` · ${movedIds.size} moved, ${addedIds.size} new (highlighted)` : ""}</p>
                </Form>
              </div>
              <div className="p-2 sm:p-3">
                {placements.length ? <OfficialGrid data={data} placements={placements} movedIds={movedIds} addedIds={addedIds} /> : <EmptyState icon={CalendarDays} title="No sessions for this selection" compact />}
              </div>
            </Card>
          )}

          {tab === "bookings" && showingBaseline && (
            <Callout tone="info" title="Showing the baseline run's booking decisions">
              The repair export (schedule_after.json) carries only the timetable; Spectra decisions were made in {baselineRun!.label} and are unchanged.
            </Callout>
          )}
          {tab === "bookings" && (
            <Card>
              <CardHeader icon={Ticket} title="Spectra week decisions" description={`Official priority: ${data.priority_order.slice(2).join(" > ")} · role caps applied · ties by submission time`} />
              {decisionsSchedule?.fest_week ? (
                <TableWrap>
                  <Table className="min-w-[980px]">
                    <THead><tr><TH>Request</TH><TH>Effective category</TH><TH>Requested windows</TH><TH>Decision</TH><TH>Placement</TH><TH className="w-80">Reason</TH></tr></THead>
                    <tbody>
                      {sortedRequests.map((req) => {
                        const d = decBy.get(req.id);
                        const eff = effectiveCategory(data, req);
                        return (
                          <TR key={req.id} className="align-top">
                            <TD>
                              <p className="font-semibold">{req.id} · {req.title}</p>
                              <p className="text-xs text-ink-2">{req.requester} ({req.role}) · {req.attendance} people · {req.duration_periods}h</p>
                              {cancelled.has(req.id) && <Badge tone="neutral" className="mt-1">Cancelled by requester</Badge>}
                            </TD>
                            <TD>
                              <Badge tone="outline">{eff.replaceAll("_", " ")}</Badge>
                              {eff !== req.requested_category && <p className="mt-1 text-[11px] text-warning-fg">capped from “{req.requested_category.replaceAll("_", " ")}” by role</p>}
                            </TD>
                            <TD className="text-xs text-ink-2">{req.windows.map((w) => `${w.day} P${w.from_period}–P${w.to_period}`).join(", ")}</TD>
                            <TD>
                              {d ? <Badge tone={d.status === "approved" ? "success" : d.status === "alternative_offered" ? "info" : "danger"}>{d.status === "alternative_offered" ? "Alternative offered" : d.status[0].toUpperCase() + d.status.slice(1)}</Badge> : <Badge tone="warning">No decision</Badge>}
                            </TD>
                            <TD className="text-[13px]">{d?.day ? <>{d.day} P{d.start_period}–P{d.end_period}<p className="text-xs text-ink-2">{d.room_id}</p></> : <span className="text-ink-3">—</span>}</TD>
                            <TD className="text-xs text-ink-2">{d?.reason ?? "—"}</TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
              ) : (
                <EmptyState icon={Ticket} title="This repair export doesn't include booking decisions" description="Booking decisions live in the baseline schedule run." compact />
              )}
            </Card>
          )}

          {tab === "exams" && showingBaseline && (
            <Callout tone="info" title="Showing the baseline run's exam timetable">
              Exams are scheduled in {baselineRun!.label}; the repair only changes the teaching week.
            </Callout>
          )}
          {tab === "exams" && (
            <Card>
              <CardHeader icon={ClipboardList} title="Midsem examination timetable" description="Rooms seat half capacity during exams; large exams use several rooms" />
              {decisionsSchedule?.exams?.length ? (
                <TableWrap>
                  <Table className="min-w-[860px]">
                    <THead><tr><TH>Exam</TH><TH>Courses</TH><TH>Groups</TH><TH className="text-right">Candidates</TH><TH>Slot</TH><TH>Rooms (half capacity)</TH><TH>Status</TH></tr></THead>
                    <tbody>
                      {[...(decisionsSchedule?.exams ?? [])].sort((a, b) => DAY_ORDER.concat("SAT").indexOf(a.day) - DAY_ORDER.concat("SAT").indexOf(b.day) || a.session.localeCompare(b.session)).map((e) => {
                        const exam = examMap.get(e.exam_id);
                        const seats = e.rooms.reduce((n, rid) => n + Math.floor((examRooms.get(rid)?.capacity ?? 0) / 2), 0);
                        const ok = exam ? seats >= exam.size : false;
                        return (
                          <TR key={e.exam_id}>
                            <TD className="font-semibold">{e.exam_id}</TD>
                            <TD className="text-ink-2">{exam?.course_ids.join(", ")}</TD>
                            <TD className="text-xs text-ink-2">{exam?.groups.join(" + ")}</TD>
                            <TD className="tabular text-right">{exam?.size}</TD>
                            <TD>{e.day} {e.session}</TD>
                            <TD className="text-xs text-ink-2">{e.rooms.join(", ")} · {seats} seats</TD>
                            <TD><Badge tone={ok ? "success" : "danger"}>{ok ? "Valid" : "Check capacity"}</Badge></TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
              ) : (
                <EmptyState icon={ClipboardList} title="Exams are in the baseline run" description="schedule_after.json only carries the repaired timetable." compact />
              )}
            </Card>
          )}
        </div>
      )}

      {runs.length > 0 && (
        <Card className="mt-6">
          <CardHeader icon={History} title="Run history" description="Every run is stored with its export and the validator's report" />
          <ul className="divide-y divide-line">
            {runs.map((r) => {
              const rep = r.report as unknown as ValidatorReport;
              return (
                <li key={r.id}>
                  <Link href={qs("/admin/official", { run: r.id })} className={cn("flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13px] transition-colors hover:bg-subtle", run?.id === r.id && "bg-brand-50/50")}>
                    <span className="flex items-center gap-2">
                      <Badge tone={r.kind === "schedule" ? "brand" : "warning"}>{r.kind}</Badge>
                      <span className="font-medium text-ink">{r.label}</span>
                      <span className="text-xs text-ink-3">{formatRelative(r.createdAt)}</span>
                    </span>
                    <span className={cn("text-xs font-semibold", rep.hard_violation_count === 0 ? "text-success-fg" : "text-danger-fg")}>
                      {rep.hard_violation_count} hard · soft {rep.soft_total}
                      {rep.bookings ? ` · bookings ${rep.bookings.booking_score}/${rep.bookings.booking_score_max_if_all_approved}` : ""}
                      {rep.stability ? ` · moved ${rep.stability.sessions_moved}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
