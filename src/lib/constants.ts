import type {
  ChangeType,
  DisruptionType,
  Priority,
  RequestStatus,
  Role,
  RoomStatus,
  RoomType,
  SessionKind,
} from "@/db/schema";

export type { ChangeType, DisruptionType, Priority, RequestStatus, Role, RoomStatus, RoomType, SessionKind };

export const PRODUCT = {
  name: "TESSRA",
  descriptor: "Intelligent Campus ERP",
  tagline: "Smarter Schedules. Seamless Campus Operations.",
  summary:
    "A unified platform that brings academic scheduling, campus resources, venue bookings, and operational decisions into one intelligent workspace.",
};

export const ROLES: Role[] = ["admin", "coordinator", "faculty", "club"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  coordinator: "Department Coordinator",
  faculty: "Faculty",
  club: "Club Representative",
};

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  coordinator: "/coordinator",
  faculty: "/faculty",
  club: "/club",
};

export const ROLE_WORKSPACE: Record<Role, string> = {
  admin: "Admin workspace",
  coordinator: "Coordinator workspace",
  faculty: "Faculty workspace",
  club: "Club workspace",
};

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const DAY_COUNT = 5;
export const PERIOD_COUNT = 8;
export const PERIOD_MINUTES = 50;

export const PERIODS: { n: number; start: string; end: string }[] = [
  { n: 1, start: "09:00", end: "09:50" },
  { n: 2, start: "09:50", end: "10:40" },
  { n: 3, start: "10:55", end: "11:45" },
  { n: 4, start: "11:45", end: "12:35" },
  { n: 5, start: "13:30", end: "14:20" },
  { n: 6, start: "14:20", end: "15:10" },
  { n: 7, start: "15:25", end: "16:15" },
  { n: 8, start: "16:15", end: "17:05" },
];

/** Multi-period sessions may not span the lunch break that follows this period. */
export const LUNCH = { afterPeriod: 4, start: "12:35", end: "13:30" };

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  lecture: "Lecture hall",
  lab: "Laboratory",
  seminar: "Seminar room",
  auditorium: "Auditorium",
  exam_hall: "Examination hall",
  outdoor: "Outdoor venue",
};

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  active: "Active",
  maintenance: "Under maintenance",
  inactive: "Inactive",
};

export const KIND_LABEL: Record<SessionKind, string> = {
  lecture: "Lecture",
  lab: "Lab",
  tutorial: "Tutorial",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  reschedule: "Reschedule",
  room_change: "Room change",
  extra_class: "New class",
};

export const DISRUPTION_TYPE_LABEL: Record<DisruptionType, string> = {
  faculty_absence: "Faculty absence",
  room_unavailable: "Room unavailable",
};

export const BOOKING_CATEGORIES: { value: string; label: string }[] = [
  { value: "club_event", label: "Club event" },
  { value: "department_event", label: "Department event" },
  { value: "workshop", label: "Workshop" },
  { value: "seminar", label: "Seminar / guest lecture" },
  { value: "meeting", label: "Meeting" },
  { value: "cultural", label: "Cultural programme" },
  { value: "sports", label: "Sports & recreation" },
];

export function categoryLabel(value: string) {
  return BOOKING_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const ROOM_FEATURES = [
  "Projector",
  "Smart board",
  "Audio system",
  "Air conditioning",
  "Wi-Fi",
  "Lab workstations",
  "Lecture capture",
  "Stage lighting",
];

export const BOOKING_NEEDS = [
  "Projector",
  "Audio system",
  "Microphones",
  "Stage lighting",
  "Recording",
  "Wi-Fi access",
  "Lab workstations",
  "Accessibility",
];

export const DEMO_PASSWORD = "tessra123";

export const DEMO_ACCOUNTS: { role: Role; email: string; name: string; detail: string }[] = [
  { role: "admin", email: "admin@westbrook.edu", name: "Aditi Kapoor", detail: "Academic Operations" },
  { role: "coordinator", email: "coordinator.cse@westbrook.edu", name: "Dr. Meera Iyer", detail: "Computer Science & Engineering" },
  { role: "faculty", email: "ananya.rao@westbrook.edu", name: "Dr. Ananya Rao", detail: "Associate Professor · CSE" },
  { role: "club", email: "robotics@westbrook.edu", name: "Kabir Malhotra", detail: "Robotics Society" },
];
