export type CampusHealthIndicatorKey =
  | "academic"
  | "faculty"
  | "rooms"
  | "requests"
  | "events"
  | "scheduling";

export type CampusHealthState = "healthy" | "stable" | "watch" | "risk" | "unavailable";

export type CampusHealthInputs = {
  academic: {
    completedUnits: number;
    totalUnits: number;
  };
  faculty: {
    availablePeriods: number;
    totalPeriods: number;
    restrictedFaculty: number;
    totalFaculty: number;
    dayLabel: string;
  };
  rooms: {
    usedPeriods: number;
    totalPeriods: number;
    activeRooms: number;
    totalRooms: number;
  };
  requests: {
    bookings: number;
    changes: number;
    disruptions: number;
    access: number;
  };
  events: {
    approvedNext30Days: number;
    target: number;
  };
  scheduling: null | {
    placedPeriods: number;
    requiredPeriods: number;
    hardConflicts: number;
  };
};

export type CampusHealthIndicator = {
  key: CampusHealthIndicatorKey;
  label: string;
  score: number | null;
  weight: number;
  state: CampusHealthState;
  value: string;
  explanation: string;
  formula: string;
  source: string;
  href: string | null;
};

export type CampusHealthReport = {
  score: number | null;
  state: CampusHealthState;
  stateLabel: string;
  activeWeight: number;
  excludedWeight: number;
  availableCount: number;
  indicators: CampusHealthIndicator[];
  generatedAt: Date;
};

const WEIGHTS: Record<CampusHealthIndicatorKey, number> = {
  academic: 20,
  faculty: 15,
  rooms: 15,
  requests: 15,
  events: 10,
  scheduling: 25,
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? clampScore((numerator / denominator) * 100) : null;
}

export function healthState(score: number | null): CampusHealthState {
  if (score === null) return "unavailable";
  if (score >= 85) return "healthy";
  if (score >= 70) return "stable";
  if (score >= 50) return "watch";
  return "risk";
}

export function healthStateLabel(state: CampusHealthState) {
  return {
    healthy: "Healthy",
    stable: "Stable",
    watch: "Watch",
    risk: "Needs attention",
    unavailable: "No data",
  }[state];
}

/**
 * Healthy room use is deliberately a band, not “more is always better”.
 * Below 40% indicates idle capacity; above 85% indicates little recovery room.
 */
export function roomUtilisationHealth(utilisation: number) {
  const value = Math.max(0, Math.min(100, utilisation));
  if (value < 40) return clampScore((value / 40) * 100);
  if (value <= 85) return 100;
  return clampScore(((100 - value) / 15) * 100);
}

export function pendingRequestHealth(total: number) {
  return clampScore(100 - Math.max(0, total) * 8);
}

export function schedulingHealth(placedPeriods: number, requiredPeriods: number, hardConflicts: number) {
  if (requiredPeriods <= 0) return null;
  const completion = Math.max(0, Math.min(100, (placedPeriods / requiredPeriods) * 100));
  const conflictFree = clampScore(100 - Math.max(0, hardConflicts) * 20);
  return clampScore(completion * 0.75 + conflictFree * 0.25);
}

function indicator(input: Omit<CampusHealthIndicator, "state">): CampusHealthIndicator {
  return { ...input, state: healthState(input.score) };
}

export function buildCampusHealthReport(inputs: CampusHealthInputs, generatedAt = new Date()): CampusHealthReport {
  const academicScore = percentage(inputs.academic.completedUnits, inputs.academic.totalUnits);
  const facultyScore = percentage(inputs.faculty.availablePeriods, inputs.faculty.totalPeriods);
  const roomUtilisation = percentage(inputs.rooms.usedPeriods, inputs.rooms.totalPeriods);
  const roomScore = roomUtilisation === null ? null : roomUtilisationHealth(roomUtilisation);
  const pendingTotal = Object.values(inputs.requests).reduce((sum, value) => sum + Math.max(0, value), 0);
  const eventScore = inputs.events.target > 0
    ? clampScore((Math.max(0, inputs.events.approvedNext30Days) / inputs.events.target) * 100)
    : null;
  const scheduleScore = inputs.scheduling
    ? schedulingHealth(inputs.scheduling.placedPeriods, inputs.scheduling.requiredPeriods, inputs.scheduling.hardConflicts)
    : null;

  const indicators: CampusHealthIndicator[] = [
    indicator({
      key: "academic",
      label: "Academic progress",
      score: academicScore,
      weight: WEIGHTS.academic,
      value: inputs.academic.totalUnits
        ? `${inputs.academic.completedUnits}/${inputs.academic.totalUnits} syllabus units covered`
        : "No syllabus units recorded",
      explanation: inputs.academic.totalUnits
        ? "Coverage reflects faculty-marked syllabus units across courses."
        : "Add syllabus units in Coursework before this indicator can be scored.",
      formula: "Completed syllabus units ÷ recorded syllabus units × 100.",
      source: "Coursework · syllabus unit completion",
      href: "/admin/coursework",
    }),
    indicator({
      key: "faculty",
      label: "Faculty availability",
      score: facultyScore,
      weight: WEIGHTS.faculty,
      value: inputs.faculty.totalPeriods
        ? `${facultyScore}% of faculty-periods available · ${inputs.faculty.dayLabel}`
        : "No faculty availability snapshot",
      explanation: inputs.faculty.totalPeriods
        ? `${inputs.faculty.restrictedFaculty} of ${inputs.faculty.totalFaculty} faculty have at least one recorded restriction for this teaching day.`
        : "A published timetable is needed to calculate the live teaching-day denominator.",
      formula: "Unblocked faculty-periods ÷ all faculty-periods for the selected teaching day × 100.",
      source: "Faculty availability blocks · teaching calendar",
      href: "/admin/academics?tab=offerings",
    }),
    indicator({
      key: "rooms",
      label: "Room utilisation",
      score: roomScore,
      weight: WEIGHTS.rooms,
      value: roomUtilisation === null
        ? "No published room-load snapshot"
        : `${roomUtilisation}% weekly teaching-room utilisation`,
      explanation: inputs.rooms.totalPeriods
        ? `${inputs.rooms.activeRooms} of ${inputs.rooms.totalRooms} teaching rooms are active. A 40–85% utilisation band receives full health credit.`
        : "Publish a timetable before room utilisation can be scored.",
      formula: "100 points inside the 40–85% target band; linearly reduced below 40% or above 85%.",
      source: "Published timetable · active lecture/lab/seminar rooms",
      href: "/admin/venues",
    }),
    indicator({
      key: "requests",
      label: "Pending requests",
      score: pendingRequestHealth(pendingTotal),
      weight: WEIGHTS.requests,
      value: `${pendingTotal} outstanding decision${pendingTotal === 1 ? "" : "s"}`,
      explanation: `${inputs.requests.bookings} bookings · ${inputs.requests.changes} changes · ${inputs.requests.disruptions} disruptions · ${inputs.requests.access} access requests.`,
      formula: "100 − (8 × outstanding decisions), with a floor of 0.",
      source: "Booking, change, disruption and access-request queues",
      href: "/admin/approvals",
    }),
    indicator({
      key: "events",
      label: "Event activity",
      score: eventScore,
      weight: WEIGHTS.events,
      value: `${inputs.events.approvedNext30Days} approved event${inputs.events.approvedNext30Days === 1 ? "" : "s"} in the next 30 days`,
      explanation: `The current transparent activity target is ${inputs.events.target} approved events per 30-day window.`,
      formula: `Approved events in the next 30 days ÷ target of ${inputs.events.target} × 100, capped at 100.`,
      source: "Approved operational bookings",
      href: "/admin/bookings",
    }),
    indicator({
      key: "scheduling",
      label: "Scheduling efficiency",
      score: scheduleScore,
      weight: WEIGHTS.scheduling,
      value: inputs.scheduling
        ? `${inputs.scheduling.placedPeriods}/${inputs.scheduling.requiredPeriods} periods placed · ${inputs.scheduling.hardConflicts} hard conflict${inputs.scheduling.hardConflicts === 1 ? "" : "s"}`
        : "No published timetable",
      explanation: "Placement completeness carries 75% of this indicator; conflict-free operation carries 25%.",
      formula: "(Placement completion × 0.75) + ((100 − 20 per hard conflict) × 0.25).",
      source: "Published timetable statistics · deterministic validator",
      href: "/admin/scheduling",
    }),
  ];

  const available = indicators.filter((item) => item.score !== null);
  const activeWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const weightedScore = activeWeight
    ? clampScore(available.reduce((sum, item) => sum + (item.score ?? 0) * item.weight, 0) / activeWeight)
    : null;
  const state = healthState(weightedScore);

  return {
    score: weightedScore,
    state,
    stateLabel: healthStateLabel(state),
    activeWeight,
    excludedWeight: 100 - activeWeight,
    availableCount: available.length,
    indicators,
    generatedAt,
  };
}
