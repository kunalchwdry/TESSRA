import assert from "node:assert/strict";
import test from "node:test";
import { parsePlainLanguageBooking } from "./booking-parser";
import { todayIso } from "./utils";

const base = {
  today: "2026-11-02",
  minDate: "2026-11-04",
  maxHours: 6,
  mode: "club" as const,
};

const parse = (text: string) => parsePlainLanguageBooking({ ...base, text });

test("institute date uses Asia/Kolkata even when the server clock is UTC", () => {
  assert.equal(todayIso(new Date("2026-10-31T20:00:00Z")), "2026-11-01");
});

test("English request extracts weekday, PM range, attendance and equipment", () => {
  const draft = parse("Need a room for 45 people on Tuesday 6 to 8 pm, projector please.");
  assert.equal(draft.date, "2026-11-10");
  assert.equal(draft.startTime, "18:00");
  assert.equal(draft.endTime, "20:00");
  assert.equal(draft.attendees, 45);
  assert.deepEqual(draft.needs, ["Projector"]);
  assert.equal(draft.followUp.length, 0);
});

test("Hinglish request treats kal as tomorrow and understands shaam, baje, ghante and log", () => {
  const draft = parse("seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye");
  assert.equal(draft.date, "2026-11-03");
  assert.equal(draft.startTime, "18:00");
  assert.equal(draft.endTime, "20:00");
  assert.equal(draft.attendees, 100);
  assert.deepEqual(draft.roomTypeHints, ["seminar"]);
  assert.ok(draft.needs.includes("Microphones"));
  assert.ok(draft.followUp.some((x) => x.includes("earliest permitted date")));
});

test("hyphenated duration overrides the visible vague-time default", () => {
  const draft = parse("Computer lab for a 3-hour coding contest on Thursday afternoon, about 60 participants");
  assert.equal(draft.startTime, "14:00");
  assert.equal(draft.endTime, "17:00");
  assert.equal(draft.category, "workshop");
  assert.deepEqual(draft.roomTypeHints, ["lab"]);
  assert.ok(draft.needs.includes("Lab workstations"));
});

test("recurring multi-day text is never silently converted into a series", () => {
  const draft = parse("Our club meets every Monday and Wednesday 7 to 8 pm, 30 people, any small room is fine");
  assert.equal(draft.recurring, true);
  assert.equal(draft.date, "2026-11-09");
  assert.ok(draft.followUp.some((x) => x.includes("one occurrence")));
});

test("vague after-lunch wording is explicit as an editable assumption", () => {
  const draft = parse("Need somewhere for quiz finals after lunch on Thursday, maybe 150 people");
  assert.equal(draft.startTime, "14:00");
  assert.equal(draft.endTime, "16:00");
  assert.ok(draft.assumptions.some((x) => x.includes("after lunch")));
});

test("missing essentials produce follow-up questions rather than invented values", () => {
  const draft = parse("Need an auditorium for the annual show");
  assert.equal(draft.date, null);
  assert.equal(draft.startTime, null);
  assert.equal(draft.attendees, null);
  assert.ok(draft.followUp.length >= 3);
});
