import type { Role, Tone } from "@/db/schema";

export const NOTICE_CATEGORIES = [
  { value: "urgent", label: "Urgent", description: "Immediate action or safety-critical change" },
  { value: "timetable", label: "Timetable", description: "Class or timetable update" },
  { value: "room", label: "Room", description: "Venue relocation or availability change" },
  { value: "exam", label: "Exam", description: "Examination update" },
  { value: "event", label: "Event", description: "Campus or department event" },
  { value: "general", label: "General", description: "General information" },
] as const;

export const NOTICE_AUDIENCES = [
  { value: "all", label: "Everyone", description: "All coordinators, faculty and club accounts" },
  { value: "faculty", label: "All faculty", description: "Every approved faculty account" },
  { value: "coordinator", label: "All coordinators", description: "Every approved department coordinator" },
  { value: "club", label: "All clubs", description: "Every approved club account" },
  { value: "department", label: "One department", description: "Faculty and coordinators in the selected department" },
] as const;

export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number]["value"];
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number]["value"];

export type NoticeDraft = {
  title: string;
  body: string;
  category: NoticeCategory;
  audience: NoticeAudience;
  departmentId: number | null;
};

export type NoticeRecipient = {
  role: Role;
  departmentId: number | null;
  approvalStatus: string;
};

const CATEGORY_VALUES = new Set<string>(NOTICE_CATEGORIES.map((item) => item.value));
const AUDIENCE_VALUES = new Set<string>(NOTICE_AUDIENCES.map((item) => item.value));

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = Object.fromEntries(
  NOTICE_CATEGORIES.map((item) => [item.value, item.label]),
) as Record<NoticeCategory, string>;

export const NOTICE_AUDIENCE_LABEL: Record<NoticeAudience, string> = Object.fromEntries(
  NOTICE_AUDIENCES.map((item) => [item.value, item.label]),
) as Record<NoticeAudience, string>;

export function isNoticeCategory(value: string): value is NoticeCategory {
  return CATEGORY_VALUES.has(value);
}

export function isNoticeAudience(value: string): value is NoticeAudience {
  return AUDIENCE_VALUES.has(value);
}

export function validateNoticeDraft(input: {
  title: string;
  body: string;
  category: string;
  audience: string;
  departmentId: number | null;
}): { ok: true; value: NoticeDraft } | { ok: false; fieldErrors: Record<string, string> } {
  const title = input.title.trim();
  const body = input.body.trim();
  const fieldErrors: Record<string, string> = {};

  if (title.length < 5) fieldErrors.title = "Use at least 5 characters.";
  else if (title.length > 100) fieldErrors.title = "Keep the title within 100 characters.";

  if (body.length < 10) fieldErrors.body = "Explain the update in at least 10 characters.";
  else if (body.length > 600) fieldErrors.body = "Keep the notice within 600 characters.";

  if (!isNoticeCategory(input.category)) fieldErrors.category = "Choose a valid notice category.";
  if (!isNoticeAudience(input.audience)) fieldErrors.audience = "Choose a valid audience.";
  if (input.audience === "department" && (!input.departmentId || !Number.isInteger(input.departmentId) || input.departmentId < 1)) {
    fieldErrors.departmentId = "Choose the department that should receive this notice.";
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  return {
    ok: true,
    value: {
      title,
      body,
      category: input.category as NoticeCategory,
      audience: input.audience as NoticeAudience,
      departmentId: input.audience === "department" ? input.departmentId : null,
    },
  };
}

export function noticeTone(category: NoticeCategory): Tone {
  if (category === "urgent") return "error";
  if (category === "timetable" || category === "room" || category === "exam") return "warning";
  if (category === "event") return "success";
  return "info";
}

/** Approved admins are publishers, not inbox recipients. */
export function isNoticeRecipient(user: NoticeRecipient, notice: Pick<NoticeDraft, "audience" | "departmentId">) {
  if (user.approvalStatus !== "approved" || user.role === "admin") return false;
  if (notice.audience === "all") return ["coordinator", "faculty", "club"].includes(user.role);
  if (notice.audience === "department") {
    return Boolean(notice.departmentId) && user.departmentId === notice.departmentId && (user.role === "faculty" || user.role === "coordinator");
  }
  return user.role === notice.audience;
}

export type NoticeMarker = {
  campaignId: number;
  category: NoticeCategory;
  audience: NoticeAudience;
  departmentId: number | null;
};

const NOTICE_MARKER_PREFIX = "notice:v1:";

/**
 * Notice campaigns reuse the existing notifications table. Structured metadata
 * lives in href so no production database migration is required. The inbox
 * recognises this internal marker and never renders it as a navigable URL.
 */
export function makeNoticeMarker(marker: NoticeMarker) {
  const departmentId = marker.audience === "department" ? marker.departmentId ?? 0 : 0;
  return `${NOTICE_MARKER_PREFIX}${marker.campaignId}:${marker.category}:${marker.audience}:${departmentId}`;
}

export function parseNoticeMarker(value: string | null | undefined): NoticeMarker | null {
  if (!value?.startsWith(NOTICE_MARKER_PREFIX)) return null;
  const parts = value.slice(NOTICE_MARKER_PREFIX.length).split(":");
  if (parts.length !== 4) return null;
  const [campaignRaw, category, audience, departmentRaw] = parts;
  const campaignId = Number(campaignRaw);
  const departmentId = Number(departmentRaw);
  if (!Number.isInteger(campaignId) || campaignId < 1 || !isNoticeCategory(category) || !isNoticeAudience(audience)) return null;
  if (!Number.isInteger(departmentId) || departmentId < 0) return null;
  if (audience === "department" && departmentId < 1) return null;
  if (audience !== "department" && departmentId !== 0) return null;
  return { campaignId, category, audience, departmentId: audience === "department" ? departmentId : null };
}

export function noticeAudienceLabel(audience: NoticeAudience, departmentName?: string | null) {
  return audience === "department" ? departmentName ?? "Selected department" : NOTICE_AUDIENCE_LABEL[audience];
}
