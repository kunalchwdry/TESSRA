import assert from "node:assert/strict";
import test from "node:test";
import {
  isNoticeRecipient,
  makeNoticeMarker,
  noticeAudienceLabel,
  noticeTone,
  parseNoticeMarker,
  validateNoticeDraft,
  type NoticeDraft,
} from "./notices";

const valid = {
  title: "DSP Lab moved today",
  body: "The session will now be held in ECE Lab 4 from 2:00 PM.",
  category: "room",
  audience: "department",
  departmentId: 3,
};

test("validates and normalises a targeted notice", () => {
  const result = validateNoticeDraft({ ...valid, title: `  ${valid.title}  `, body: `  ${valid.body}  ` });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.title, valid.title);
  assert.equal(result.value.body, valid.body);
  assert.equal(result.value.departmentId, 3);
});

test("requires meaningful copy, known values and a department for department audiences", () => {
  const result = validateNoticeDraft({ title: "Hi", body: "Short", category: "fake", audience: "department", departmentId: null });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["body", "category", "departmentId", "title"]);

  const badAudience = validateNoticeDraft({ ...valid, audience: "students" });
  assert.equal(badAudience.ok, false);
  if (!badAudience.ok) assert.equal(badAudience.fieldErrors.audience, "Choose a valid audience.");
});

test("drops irrelevant department identifiers for role audiences", () => {
  const result = validateNoticeDraft({ ...valid, audience: "faculty", departmentId: 99 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.departmentId, null);
});

test("selects only approved recipients inside the requested audience", () => {
  const departmentNotice: Pick<NoticeDraft, "audience" | "departmentId"> = { audience: "department", departmentId: 3 };
  assert.equal(isNoticeRecipient({ role: "faculty", departmentId: 3, approvalStatus: "approved" }, departmentNotice), true);
  assert.equal(isNoticeRecipient({ role: "coordinator", departmentId: 3, approvalStatus: "approved" }, departmentNotice), true);
  assert.equal(isNoticeRecipient({ role: "faculty", departmentId: 2, approvalStatus: "approved" }, departmentNotice), false);
  assert.equal(isNoticeRecipient({ role: "club", departmentId: 3, approvalStatus: "approved" }, departmentNotice), false);
  assert.equal(isNoticeRecipient({ role: "faculty", departmentId: 3, approvalStatus: "pending" }, departmentNotice), false);
  assert.equal(isNoticeRecipient({ role: "admin", departmentId: 3, approvalStatus: "approved" }, { audience: "all", departmentId: null }), false);
});

test("round-trips strict internal campaign markers", () => {
  const marker = makeNoticeMarker({ campaignId: 42, category: "urgent", audience: "department", departmentId: 3 });
  assert.equal(marker, "notice:v1:42:urgent:department:3");
  assert.deepEqual(parseNoticeMarker(marker), { campaignId: 42, category: "urgent", audience: "department", departmentId: 3 });
  assert.equal(parseNoticeMarker("/faculty/timetable"), null);
  assert.equal(parseNoticeMarker("notice:v1:0:urgent:all:0"), null);
  assert.equal(parseNoticeMarker("notice:v1:42:fake:all:0"), null);
  assert.equal(parseNoticeMarker("notice:v1:42:general:all:7"), null);
});

test("maps notice urgency to existing notification tones and readable audiences", () => {
  assert.equal(noticeTone("urgent"), "error");
  assert.equal(noticeTone("room"), "warning");
  assert.equal(noticeTone("event"), "success");
  assert.equal(noticeTone("general"), "info");
  assert.equal(noticeAudienceLabel("department", "Electronics"), "Electronics");
  assert.equal(noticeAudienceLabel("faculty"), "All faculty");
});
