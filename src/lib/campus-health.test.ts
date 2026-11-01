import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCampusHealthReport,
  healthState,
  pendingRequestHealth,
  roomUtilisationHealth,
  schedulingHealth,
  type CampusHealthInputs,
} from "./campus-health";

const healthyInputs: CampusHealthInputs = {
  academic: { completedUnits: 18, totalUnits: 20 },
  faculty: { availablePeriods: 342, totalPeriods: 360, restrictedFaculty: 4, totalFaculty: 40, dayLabel: "Monday" },
  rooms: { usedPeriods: 480, totalPeriods: 800, activeRooms: 20, totalRooms: 20 },
  requests: { bookings: 1, changes: 0, disruptions: 0, access: 0 },
  events: { approvedNext30Days: 4, target: 4 },
  scheduling: { placedPeriods: 243, requiredPeriods: 243, hardConflicts: 0 },
};

test("normalises the overall score across available weights only", () => {
  const report = buildCampusHealthReport(healthyInputs, new Date("2026-11-01T00:00:00Z"));
  assert.equal(report.activeWeight, 100);
  assert.equal(report.excludedWeight, 0);
  assert.equal(report.availableCount, 6);
  assert.equal(report.score, 96);
  assert.equal(report.state, "healthy");
});

test("excludes academic progress too when no syllabus units exist", () => {
  const report = buildCampusHealthReport({ ...healthyInputs, academic: { completedUnits: 0, totalUnits: 0 } });
  assert.equal(report.activeWeight, 80);
  assert.equal(report.excludedWeight, 20);
  assert.equal(report.availableCount, 5);
  assert.equal(report.indicators.find((item) => item.key === "academic")?.state, "unavailable");
  assert.match(report.indicators.find((item) => item.key === "academic")?.explanation ?? "", /before this indicator can be scored/i);
});

test("room utilisation rewards a safe band rather than blindly rewarding maximum load", () => {
  assert.equal(roomUtilisationHealth(0), 0);
  assert.equal(roomUtilisationHealth(20), 50);
  assert.equal(roomUtilisationHealth(40), 100);
  assert.equal(roomUtilisationHealth(85), 100);
  assert.equal(roomUtilisationHealth(92.5), 50);
  assert.equal(roomUtilisationHealth(100), 0);
});

test("pending queues use a visible linear penalty and never go below zero", () => {
  assert.equal(pendingRequestHealth(0), 100);
  assert.equal(pendingRequestHealth(5), 60);
  assert.equal(pendingRequestHealth(20), 0);
  assert.equal(pendingRequestHealth(-4), 100);
});

test("scheduling combines placement completeness and hard-conflict health", () => {
  assert.equal(schedulingHealth(100, 100, 0), 100);
  assert.equal(schedulingHealth(80, 100, 0), 85);
  assert.equal(schedulingHealth(100, 100, 2), 90);
  assert.equal(schedulingHealth(0, 0, 0), null);
});

test("health bands are deterministic at their boundaries", () => {
  assert.equal(healthState(null), "unavailable");
  assert.equal(healthState(49), "risk");
  assert.equal(healthState(50), "watch");
  assert.equal(healthState(70), "stable");
  assert.equal(healthState(85), "healthy");
});
