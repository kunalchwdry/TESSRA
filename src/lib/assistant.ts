/**
 * TESSRA Assistant — a deterministic, database-backed intent engine.
 * Every answer is computed from live data; proposals are validated by the
 * scheduling engine but are NEVER applied until the user submits them and
 * (for timetable changes) a coordinator approves.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { AssistantPayload } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { DAYS, DAY_SHORT, PERIOD_COUNT } from "./constants";
import { getPublishedVersion, loadEngineState, slotRef } from "./engine";
import { findAlternatives, validateSessions, type EngineSession } from "./scheduler";
import { currentDayIndex, hoursFromPeriods, periodLabel, periodTime, toMinutes } from "./utils";

type Reply = { content: string; payload: AssistantPayload | null };

const DAY_PATTERNS: [RegExp, number][] = [
  [/\bmon(day)?\b/g, 0],
  [/\btue(s|sday)?\b/g, 1],
  [/\bwed(nesday)?\b/g, 2],
  [/\bthu(r|rs|rsday)?\b/g, 3],
  [/\bfri(day)?\b/g, 4],
];

function parseDays(text: string) {
  const found: { day: number; index: number }[] = [];
  for (const [re, day] of DAY_PATTERNS) for (const m of text.matchAll(re)) found.push({ day, index: m.index ?? 0 });
  const today = currentDayIndex();
  const t1 = text.indexOf("today");
  if (t1 >= 0) found.push({ day: today < 0 ? 0 : today, index: t1 });
  const t2 = text.indexOf("tomorrow");
  if (t2 >= 0) found.push({ day: today < 0 || today === 4 ? 0 : today + 1, index: t2 });
  return found.sort((a, b) => a.index - b.index);
}

function parsePeriods(text: string): number[] | null {
  const m = text.match(/\bp(?:eriod)?\s*([1-8])(?:\s*(?:-|–|to|and)\s*p?(?:eriod)?\s*([1-8]))?/);
  if (m) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i);
  }
  if (/morning/.test(text)) return [1, 2, 3, 4];
  if (/afternoon|evening/.test(text)) return [5, 6, 7, 8];
  if (/all day|whole day|full day|entire day/.test(text)) return [1, 2, 3, 4, 5, 6, 7, 8];
  return null;
}

function covers(s: EngineSession, day: number, period: number) {
  return s.day === day && period >= s.startPeriod && period < s.startPeriod + s.duration;
}

export const SUGGESTED_PROMPTS = [
  "What's my schedule today?",
  "Find a free room on Thursday period 3 for 60 students",
  "Move my CS302 class on Wednesday to Friday",
  "Mark me unavailable on Friday afternoon",
  "How many hours am I teaching this week?",
  "Show my pending requests",
];

export async function respond(user: CurrentUser, raw: string): Promise<Reply> {
  const text = raw.toLowerCase().trim();
  const pub = await getPublishedVersion();
  if (!pub) return { content: "There is no published timetable yet, so I can't answer schedule questions right now.", payload: null };
  const state = await loadEngineState(pub.id);
  const mine = state.sessions
    .filter((s) => s.facultyId === user.id)
    .sort((a, b) => a.day - b.day || a.startPeriod - b.startPeriod);
  const groupsOf = (s: EngineSession) => s.groupIds.map(state.labels.group).join(" + ");
  const toItem = (s: EngineSession) => ({
    day: s.day,
    startPeriod: s.startPeriod,
    duration: s.duration,
    courseCode: state.labels.course(s.courseId),
    courseTitle: state.courses.get(s.courseId)?.title ?? "",
    roomCode: state.labels.room(s.roomId),
    groups: groupsOf(s),
    kind: s.kind,
  });
  const days = parseDays(text);
  const periods = parsePeriods(text);

  /* ---------------- Availability ---------------- */
  if (/(unavailable|not available|can't make|cannot make|\baway\b|\bbusy\b|block (out|my|me))/.test(text)) {
    if (!days.length) return { content: "Which day should I mark you unavailable? For example: “Mark me unavailable on Friday afternoon”.", payload: null };
    const wanted = periods ?? Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1);
    const existing = new Set(state.blockRows.filter((b) => b.facultyId === user.id).map((b) => `${b.day}:${b.period}`));
    const blocks: { day: number; period: number }[] = [];
    const skipped: { day: number; period: number; courseCode: string }[] = [];
    for (const { day } of days) {
      for (const period of wanted) {
        const teaching = mine.find((s) => covers(s, day, period));
        if (teaching) skipped.push({ day, period, courseCode: state.labels.course(teaching.courseId) });
        else if (!existing.has(`${day}:${period}`)) blocks.push({ day, period });
      }
    }
    if (!blocks.length) {
      return {
        content: skipped.length
          ? `Every requested slot is either already blocked or a teaching slot (${skipped.map((s) => `${DAY_SHORT[s.day]} P${s.period} ${s.courseCode}`).join(", ")}). Teaching slots need a schedule change request.`
          : "Those slots are already marked unavailable — nothing to change.",
        payload: null,
      };
    }
    return {
      content: `Here's the availability update I'd make: ${blocks.length} slot${blocks.length > 1 ? "s" : ""}.${skipped.length ? ` I left out ${skipped.length} slot${skipped.length > 1 ? "s" : ""} where you teach — those need a change request instead.` : ""} Nothing changes until you apply it.`,
      payload: { kind: "availability", status: "proposed", blocks, skipped, reason: "Marked via TESSRA Assistant" },
    };
  }

  /* ---------------- Reschedule proposal ---------------- */
  if (/(move|reschedule|shift|postpone|change)/.test(text) && /(class|lecture|lab|session|tutorial|[a-z]{2}\d{3})/.test(text)) {
    if (!mine.length) return { content: "You have no sessions in the published timetable to move.", payload: null };
    const codeMatch = text.match(/\b([a-z]{2}\d{3}[a-z]?)\b/);
    const toMatch = text.match(/\bto\s+(mon|tue|wed|thu|fri)/);
    const DAY_PREFIX: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };
    const toDay = toMatch ? DAY_PREFIX[toMatch[1]] : undefined;
    const fromDay = days.find((d) => d.day !== toDay)?.day;
    let candidates = mine;
    if (codeMatch) candidates = candidates.filter((s) => state.labels.course(s.courseId).toLowerCase() === codeMatch[1]);
    if (fromDay !== undefined) candidates = candidates.filter((s) => s.day === fromDay);
    if (!candidates.length) {
      return {
        content: `I couldn't find a matching session${codeMatch ? ` for ${codeMatch[1].toUpperCase()}` : ""}${fromDay !== undefined ? ` on ${DAYS[fromDay]}` : ""}. Your courses are: ${[...new Set(mine.map((s) => state.labels.course(s.courseId)))].join(", ")}.`,
        payload: null,
      };
    }
    const session = candidates[0];
    const toPeriod = periods?.[0];
    let options = findAlternatives(state.sessions, session.id, state.ctx, {
      preferDay: toDay,
      preferPeriod: toPeriod ?? session.startPeriod,
      avoidDays: toDay === undefined ? [session.day] : [],
      limit: 4,
    });
    const onRequestedDay = toDay !== undefined ? options.filter((o) => o.day === toDay) : options;
    const missedDay = toDay !== undefined && !onRequestedDay.length;
    if (onRequestedDay.length) options = [...onRequestedDay, ...options.filter((o) => o.day !== toDay)];
    const best = options[0];
    if (!best) {
      return { content: `I couldn't find any conflict-free slot for ${state.labels.course(session.courseId)} this week. Please raise a manual change request so your coordinator can help.`, payload: null };
    }
    const room = state.rooms.get(best.roomId);
    const size = session.groupIds.reduce((n, g) => n + (state.groups.get(g)?.size ?? 0), 0);
    const others = options.slice(1, 3).map((o) => `${DAY_SHORT[o.day]} ${periodLabel(o.startPeriod, session.duration)} (${state.labels.room(o.roomId)})`);
    return {
      content: `${missedDay ? `${DAYS[toDay as number]} has no conflict-free slot, but ` : ""}I found a slot for ${state.labels.course(session.courseId)} (${groupsOf(session)}). This is an AI proposal only — nothing changes until you submit it and your coordinator approves.${others.length ? ` Other options: ${others.join(", ")}.` : ""}`,
      payload: {
        kind: "proposal",
        status: "proposed",
        proposal: {
          sessionId: session.id,
          courseCode: state.labels.course(session.courseId),
          courseTitle: state.courses.get(session.courseId)?.title ?? "",
          groups: groupsOf(session),
          from: slotRef(session, state.labels),
          to: { day: best.day, period: best.startPeriod, duration: session.duration, roomId: best.roomId, roomCode: state.labels.room(best.roomId) },
          checks: [
            `No clash for ${groupsOf(session)}`,
            `You are free and available ${DAY_SHORT[best.day]} ${periodLabel(best.startPeriod, session.duration)}`,
            `${room?.code ?? "Room"} is free and seats ${room?.capacity ?? "?"} (needs ${size})`,
          ],
        },
      },
    };
  }

  /* ---------------- Free rooms ---------------- */
  if (/(free|available|empty|vacant|open)\b.*\b(room|venue|hall|lab|space)|\b(room|venue|hall|space)s?\b.*\b(free|available)/.test(text)) {
    const day = days[0]?.day ?? (currentDayIndex() < 0 ? 0 : currentDayIndex());
    const wanted = periods ?? [1];
    const capMatch = text.match(/(\d{2,3})\s*(students|people|seats|attendees|persons|learners)/);
    const minCap = capMatch ? Number(capMatch[1]) : 1;
    const wantsLab = /\blab/.test(text);
    const free = state.roomRows
      .filter((r) => r.status === "active" && r.capacity >= minCap && (wantsLab ? r.type === "lab" : ["lecture", "seminar", "auditorium"].includes(r.type)))
      .filter((r) => !state.sessions.some((s) => s.roomId === r.id && wanted.some((p) => covers(s, day, p))))
      .sort((a, b) => a.capacity - b.capacity)
      .slice(0, 6);
    const when = `${DAYS[day]} ${periodLabel(wanted[0], wanted.length)} (${periodTime(wanted[0], wanted.length)})`;
    return {
      content: free.length
        ? `${free.length} room${free.length > 1 ? "s are" : " is"} free on ${when}${minCap > 1 ? ` for ${minCap}+ people` : ""}, based on the published weekly timetable.${periods ? "" : " (No period given, so I checked P1.)"}`
        : `No ${wantsLab ? "lab" : "teaching room"} is free on ${when}${minCap > 1 ? ` for ${minCap}+ people` : ""}.`,
      payload: free.length
        ? { kind: "rooms", title: `Free on ${when}`, items: free.map((r) => ({ id: r.id, code: r.code, name: r.name, capacity: r.capacity, type: r.type })) }
        : null,
    };
  }

  /* ---------------- Workload ---------------- */
  if (/(hour|workload|\bload\b|how much|how many classes)/.test(text)) {
    const periodsTotal = mine.reduce((n, s) => n + s.duration, 0);
    const perDay = DAYS.map((d, i) => ({ d, p: mine.filter((s) => s.day === i).reduce((n, s) => n + s.duration, 0) }));
    const busiest = [...perDay].sort((a, b) => b.p - a.p)[0];
    return {
      content: `You teach ${mine.length} session${mine.length === 1 ? "" : "s"} this week — ${periodsTotal} periods, about ${hoursFromPeriods(periodsTotal)} contact hours. Busiest day: ${busiest.d} (${busiest.p} periods). Breakdown: ${perDay.map((x) => `${x.d.slice(0, 3)} ${x.p}`).join(" · ")}.`,
      payload: null,
    };
  }

  /* ---------------- Requests ---------------- */
  if (/(request|pending|approval|status)/.test(text)) {
    const rows = await db
      .select()
      .from(t.changeRequests)
      .where(eq(t.changeRequests.facultyId, user.id))
      .orderBy(desc(t.changeRequests.createdAt))
      .limit(6);
    if (!rows.length) return { content: "You haven't submitted any schedule change requests yet.", payload: null };
    const pending = rows.filter((r) => r.status === "pending").length;
    return {
      content: `You have ${pending} pending request${pending === 1 ? "" : "s"}. Here are your most recent ones:`,
      payload: {
        kind: "requests",
        items: rows.map((r) => ({ id: r.id, courseCode: r.snapshot?.courseCode ?? "Session", type: r.type, status: r.status, createdAt: r.createdAt.toISOString() })),
      },
    };
  }

  /* ---------------- Conflicts ---------------- */
  if (/(conflict|clash|issue|problem)/.test(text)) {
    const ids = new Set(mine.map((s) => s.id));
    const issues = validateSessions(state.sessions, state.ctx).filter((i) => i.sessionIds.some((id) => ids.has(id)));
    return {
      content: issues.length
        ? `I found ${issues.length} issue${issues.length > 1 ? "s" : ""} affecting your sessions: ${issues.map((i) => i.message).join("; ")}.`
        : "Good news — none of your sessions have conflicts in the published timetable.",
      payload: null,
    };
  }

  /* ---------------- Schedule ---------------- */
  if (/(schedule|timetable|class|teach|lecture|today|tomorrow|week|next)/.test(text) || days.length) {
    if (/next class|next lecture|next session/.test(text)) {
      const now = new Date();
      const dayNow = currentDayIndex();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const upcoming =
        mine.find((s) => s.day === dayNow && toMinutes(periodTime(s.startPeriod).split("–")[0]) > minutes) ??
        mine.find((s) => s.day > dayNow) ??
        mine[0];
      if (!upcoming) return { content: "You have no upcoming sessions.", payload: null };
      return { content: `Your next session is ${state.labels.course(upcoming.courseId)} on ${DAYS[upcoming.day]}.`, payload: { kind: "sessions", title: "Next session", items: [toItem(upcoming)] } };
    }
    const weekend = currentDayIndex() < 0 && /today/.test(text);
    const selected = days.length && !/week/.test(text) ? [...new Set(days.map((d) => d.day))] : [0, 1, 2, 3, 4];
    const items = mine.filter((s) => selected.includes(s.day)).map(toItem);
    const label = selected.length === 5 ? "This week" : selected.map((d) => DAYS[d]).join(", ");
    return {
      content: items.length
        ? `${weekend ? "It's the weekend, so here's Monday. " : ""}${label}: ${items.length} session${items.length > 1 ? "s" : ""}.`
        : `${weekend ? "It's the weekend — " : ""}You have no sessions on ${label}.`,
      payload: items.length ? { kind: "sessions", title: label, items } : null,
    };
  }

  return {
    content:
      "I can help with your timetable, free rooms, workload, availability and change requests. Try: “What's my schedule on Tuesday?”, “Find a free room on Thursday period 3 for 60 students”, or “Move my CS302 class on Wednesday to Friday”.",
    payload: null,
  };
}
