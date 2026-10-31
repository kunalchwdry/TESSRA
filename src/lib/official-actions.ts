"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { officialRuns } from "@/db/schema";
import { requireRole } from "./auth";
import { audit } from "./engine";
import {
  getOfficialDataset,
  getSampleDisruption,
  persistExport,
  runEngine,
  runOfficialValidator,
  type OfficialSchedule,
} from "./official";
import { fail, ok, type ActionState } from "./utils";

async function latestScheduleRun() {
  const [row] = await db
    .select()
    .from(officialRuns)
    .where(eq(officialRuns.kind, "schedule"))
    .orderBy(desc(officialRuns.id))
    .limit(1);
  return row ?? null;
}

export async function generateOfficialScheduleAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const data = await getOfficialDataset();
  let schedule: OfficialSchedule;
  try {
    schedule = await runEngine({ data, timeLimit: 90 });
  } catch (err) {
    console.error(err);
    return fail("The CP-SAT engine failed to run. Check that Python 3 with OR-Tools is available, or configure ENGINE_URL.");
  }
  if (!schedule.sessions.length) {
    return fail(`Solver returned ${schedule.solver?.status ?? "no result"}: ${(schedule.solver?.reasons ?? ["unknown"]).join("; ")}`);
  }
  const report = await runOfficialValidator({ schedule });
  await persistExport("schedule.json", schedule);
  await persistExport("report.json", report);
  const count = (await db.select({ id: officialRuns.id }).from(officialRuns)).length;
  const [run] = await db
    .insert(officialRuns)
    .values({
      kind: "schedule",
      label: `Official run ${count + 1}`,
      datasetId: data.dataset_id,
      createdById: user.id,
      schedule: schedule as unknown as Record<string, unknown>,
      report: report as unknown as Record<string, unknown>,
    })
    .returning();
  await audit(user.id, "official.generated", "schedule", run.id,
    `Official CIT schedule generated (${schedule.solver?.status}) — validator: ${report.hard_violation_count} hard violations, soft ${report.soft_total}, bookings ${report.bookings?.booking_score ?? 0}/${report.bookings?.booking_score_max_if_all_approved ?? 0}`);
  revalidatePath("/admin/official");
  return ok(
    report.hard_violation_count === 0
      ? `Schedule generated and independently validated: 0 hard violations, soft penalty ${report.soft_total}.`
      : `Schedule generated but the official validator reports ${report.hard_violation_count} hard violations — review before using it.`,
  );
}

export async function applyOfficialDisruptionAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireRole("admin");
  const baselineRun = await latestScheduleRun();
  if (!baselineRun) return fail("Generate the official schedule first — the repair needs it as a baseline.");
  const baseline = baselineRun.schedule as unknown as OfficialSchedule;
  const data = await getOfficialDataset();
  const disruption = await getSampleDisruption();
  let schedule: OfficialSchedule;
  try {
    schedule = await runEngine({ data, disruption, baseline, timeLimit: 90 });
  } catch (err) {
    console.error(err);
    return fail("The CP-SAT engine failed to run the repair.");
  }
  if (!schedule.sessions.length) {
    return fail(`No valid repair found (${schedule.solver?.status ?? "unknown"}): ${(schedule.solver?.reasons ?? []).join("; ")}`);
  }
  const report = await runOfficialValidator({ schedule, disruption, baseline });
  await persistExport("schedule_after.json", schedule);
  await persistExport("report_after.json", report);
  const count = (await db.select({ id: officialRuns.id }).from(officialRuns)).length;
  const [run] = await db
    .insert(officialRuns)
    .values({
      kind: "disruption",
      label: `Repair ${count + 1} (sample disruption)`,
      datasetId: data.dataset_id,
      createdById: user.id,
      schedule: schedule as unknown as Record<string, unknown>,
      report: report as unknown as Record<string, unknown>,
    })
    .returning();
  await audit(user.id, "official.disruption_applied", "disruption", run.id,
    `Official sample disruption repaired — validator: ${report.hard_violation_count} hard violations, ${report.stability?.sessions_moved ?? "?"} sessions moved`);
  revalidatePath("/admin/official");
  return ok(
    report.hard_violation_count === 0
      ? `Repair validated: 0 hard violations, ${report.stability?.sessions_moved ?? "?"} sessions moved from the baseline.`
      : `Repair produced ${report.hard_violation_count} hard violations — review the report.`,
  );
}
