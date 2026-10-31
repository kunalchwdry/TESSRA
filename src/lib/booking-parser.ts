import type { RoomType } from "./constants";
import { addDaysIso, parseIso } from "./utils";

export type BookingParseDraft = {
  title: string;
  category: string;
  description: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  attendees: number | null;
  roomCodeHint: string | null;
  roomTypeHints: RoomType[];
  needs: string[];
  accessible: boolean;
  assumptions: string[];
  followUp: string[];
  recurring: boolean;
};

export type BookingParseInput = {
  text: string;
  today: string;
  minDate: string;
  maxHours: number;
  mode: "club" | "department";
};

const DAY_ALIASES: { day: number; words: string[] }[] = [
  { day: 0, words: ["monday", "mon", "somwar", "somvaar"] },
  { day: 1, words: ["tuesday", "tue", "tues", "mangalwar", "mangalvaar"] },
  { day: 2, words: ["wednesday", "wed", "budhwar", "budhvaar"] },
  { day: 3, words: ["thursday", "thu", "thurs", "guruwar", "guruvaar", "brihaspativar"] },
  { day: 4, words: ["friday", "fri", "shukrawar", "shukravar", "shukravaar"] },
  { day: 5, words: ["saturday", "sat", "shanivar", "shanivaar"] },
  { day: 6, words: ["sunday", "sun", "ravivar", "ravivaar"] },
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const timeString = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function isRealIso(iso: string) {
  const d = parseIso(iso);
  return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === iso;
}

function explicitDate(text: string, today: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const value = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isRealIso(value) ? value : null;
  }

  const named = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i,
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2].toLowerCase()];
    let year = named[3] ? Number(named[3]) : parseIso(today).getFullYear();
    let value = `${year}-${pad(month)}-${pad(day)}`;
    if (!named[3] && value < today) {
      year += 1;
      value = `${year}-${pad(month)}-${pad(day)}`;
    }
    return isRealIso(value) ? value : null;
  }

  const numeric = text.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](20\d{2}))?\b/);
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3]) : parseIso(today).getFullYear();
    const value = `${year}-${pad(Number(numeric[2]))}-${pad(Number(numeric[1]))}`;
    return isRealIso(value) ? value : null;
  }
  return null;
}

function dateForWeekday(startIso: string, wantedDay: number) {
  let value = startIso;
  for (let i = 0; i < 8; i += 1) {
    const js = parseIso(value).getDay();
    const day = js === 0 ? 6 : js - 1;
    if (day === wantedDay) return value;
    value = addDaysIso(value, 1);
  }
  return startIso;
}

function parseDate(text: string, today: string, minDate: string) {
  const lower = text.toLowerCase();
  const named = explicitDate(text, today);
  if (named) return { date: named, days: [] as number[], relative: false };

  if (/\b(day after tomorrow|parso|parson)\b/.test(lower)) {
    return { date: addDaysIso(today, 2), days: [] as number[], relative: true };
  }
  // In a future booking request, Hindi “kal” means tomorrow (official starter-pack semantics).
  if (/\b(tomorrow|kal)\b/.test(lower)) {
    return { date: addDaysIso(today, 1), days: [] as number[], relative: true };
  }
  if (/\b(today|aaj)\b/.test(lower)) {
    return { date: today, days: [] as number[], relative: true };
  }

  const found: { day: number; index: number }[] = [];
  for (const entry of DAY_ALIASES) {
    for (const word of entry.words) {
      const match = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").exec(text);
      if (match) found.push({ day: entry.day, index: match.index });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const days = [...new Set(found.map((f) => f.day))];
  return { date: days.length ? dateForWeekday(minDate, days[0]) : null, days, relative: false };
}

type ClockToken = { hour: number; minute: number; meridiem: "am" | "pm" | null };

function clockToken(hourRaw: string, minuteRaw?: string, markerRaw?: string): ClockToken | null {
  const hour = Number(hourRaw);
  const minute = minuteRaw ? Number(minuteRaw) : 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  const marker = (markerRaw ?? "").toLowerCase().replace(/\./g, "");
  const meridiem = marker.startsWith("a") ? "am" : marker.startsWith("p") ? "pm" : null;
  return { hour, minute, meridiem };
}

function toClockMinutes(token: ClockToken, inferred: "am" | "pm" | null) {
  let hour = token.hour;
  const meridiem = token.meridiem ?? inferred;
  if (hour === 24) return token.minute === 0 ? 24 * 60 : null;
  if (hour > 12 && meridiem) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour * 60 + token.minute;
}

function parseDuration(lower: string) {
  const m = lower.match(/\b(\d+(?:\.5)?)\s*[- ]?\s*(?:hours?|hrs?|hr|ghante?|ghanta)\b/);
  return m ? Math.round(Number(m[1]) * 60) : null;
}

function parseTimes(text: string) {
  const lower = text.toLowerCase();
  const assumptions: string[] = [];
  const followUp: string[] = [];
  const duration = parseDuration(lower);
  const range = lower.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:baje|bje)?\s*(?:to|till|until|se|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:baje|bje|tak)?\b/i,
  );

  if (range) {
    const first = clockToken(range[1], range[2], range[3]);
    const second = clockToken(range[4], range[5], range[6]);
    if (first && second) {
      const globalHint: "am" | "pm" | null = /\b(shaam|sham|evening|raat|night)\b/.test(lower)
        ? "pm"
        : /\b(subah|morning)\b/.test(lower)
          ? "am"
          : null;
      const firstHint = first.meridiem ?? second.meridiem ?? globalHint;
      const secondHint = second.meridiem ?? first.meridiem ?? globalHint;
      let start = toClockMinutes(first, firstHint);
      let end = toClockMinutes(second, secondHint);
      if (start !== null && end !== null) {
        if (!first.meridiem && !second.meridiem && !globalHint) {
          assumptions.push("The time range had no AM/PM marker; daytime hours were assumed. Please verify it.");
        }
        if (end <= start && end + 12 * 60 > start && !second.meridiem) end += 12 * 60;
        if (end > start && end <= 24 * 60) return { start, end, assumptions, followUp };
      }
    }
  }

  const single = lower.match(/(?:\bat\s+|\bfrom\s+|\b)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:baje|bje)\b/i)
    ?? lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (single) {
    const token = clockToken(single[1], single[2], single[3]);
    const hint: "am" | "pm" | null = /\b(shaam|sham|evening|raat|night)\b/.test(lower)
      ? "pm"
      : /\b(subah|morning)\b/.test(lower)
        ? "am"
        : /\b(dopahar|afternoon)\b/.test(lower)
          ? "pm"
          : null;
    const start = token ? toClockMinutes(token, hint) : null;
    if (start !== null) {
      const length = duration ?? 120;
      if (duration === null) assumptions.push("No duration was stated; a 2-hour booking was assumed.");
      return { start, end: Math.min(start + length, 24 * 60), assumptions, followUp };
    }
  }

  const vague: { re: RegExp; start: number; label: string }[] = [
    { re: /\b(after lunch|lunch ke baad)\b/, start: 14 * 60, label: "after lunch" },
    { re: /\b(afternoon|dopahar)\b/, start: 14 * 60, label: "afternoon" },
    { re: /\b(evening|shaam|sham)\b/, start: 18 * 60, label: "evening" },
    { re: /\b(morning|subah)\b/, start: 10 * 60, label: "morning" },
    { re: /\b(night|raat)\b/, start: 20 * 60, label: "night" },
  ];
  const period = vague.find((v) => v.re.test(lower));
  if (period) {
    const length = duration ?? 120;
    assumptions.push(`“${period.label}” was interpreted as ${timeString(period.start)} for ${length / 60} hour(s).`);
    return { start: period.start, end: Math.min(period.start + length, 24 * 60), assumptions, followUp };
  }

  followUp.push("What start and end time should the venue be reserved for?");
  return { start: null, end: null, assumptions, followUp };
}

function parseAttendees(text: string) {
  const lower = text.toLowerCase();
  const noun = lower.match(/\b(?:around|about|approx(?:imately)?|lagbhag)?\s*(\d{1,4})\s*(?:people|persons|participants|students|attendees|visitors|spectators|learners|log|logon|seats)\b/);
  if (noun) return Number(noun[1]);
  const expected = lower.match(/\b(?:attendance|capacity|crowd)\s*(?:of|is|:)?\s*(\d{1,4})\b/);
  return expected ? Number(expected[1]) : null;
}

function parseNeeds(text: string) {
  const lower = text.toLowerCase();
  const needs: string[] = [];
  const add = (value: string) => {
    if (!needs.includes(value)) needs.push(value);
  };
  if (/\b(projector|projection|screen)\b/.test(lower)) add("Projector");
  if (/\b(sound|audio|pa system|speakers?)\b/.test(lower)) add("Audio system");
  if (/\b(mics?|microphones?|mic chahiye)\b/.test(lower)) {
    add("Microphones");
    add("Audio system");
  }
  if (/\b(stage|stage lights?|lighting)\b/.test(lower)) add("Stage lighting");
  if (/\b(recording|record|camera)\b/.test(lower)) add("Recording");
  if (/\b(wi[ -]?fi|internet)\b/.test(lower)) add("Wi-Fi access");
  if (/\b(computers?|workstations?|coding lab)\b/.test(lower)) add("Lab workstations");
  if (/\b(accessible|wheelchair|wheel chair|ramp|barrier[- ]free)\b/.test(lower)) add("Accessibility");
  return needs;
}

function parseRoom(text: string) {
  const lower = text.toLowerCase();
  const code = text.match(/\b(?:LT-?\d+|[A-Z]{1,5}-\d+[A-Z]?|AUD|OAT|EXH-[NS])\b/i)?.[0] ?? null;
  const types: RoomType[] = [];
  const add = (type: RoomType) => {
    if (!types.includes(type)) types.push(type);
  };
  if (/\b(auditorium|main hall|bada hall)\b/.test(lower) || code?.toUpperCase() === "AUD") add("auditorium");
  if (/\b(seminar(?: hall| room)?|small room|chhota hall)\b/.test(lower)) add("seminar");
  if (/\b(computer lab|computing lab|electronics? lab|\blab\b)\b/.test(lower)) add("lab");
  if (/\b(lecture hall|classroom|class room)\b/.test(lower) || /^LT/i.test(code ?? "")) add("lecture");
  if (/\b(outdoor|open air|lawn|ground|oat)\b/.test(lower) || code?.toUpperCase() === "OAT") add("outdoor");
  if (!types.length && /\b(room|venue|space|jagah|hall)\b/.test(lower)) types.push("seminar", "lecture", "auditorium");
  return { code: code ? code.toUpperCase().replace(/^LT(\d)/, "LT-$1") : null, types };
}

function inferCategory(text: string, mode: "club" | "department") {
  const lower = text.toLowerCase();
  if (/\b(workshop|training|bootcamp|hackathon|coding contest|clinic)\b/.test(lower)) return "workshop";
  if (/\b(seminar|guest lecture|industry speaker|talk|speaker)\b/.test(lower)) return "seminar";
  if (/\b(farewell|dance|music|concert|rehearsal|cultural|fest|stage play)\b/.test(lower)) return "cultural";
  if (/\b(sport|tournament|match|yoga)\b/.test(lower)) return "sports";
  if (/\b(meet|meeting|review)\b/.test(lower)) return "meeting";
  return mode === "department" ? "department_event" : "club_event";
}

function cleanTitle(value: string) {
  const cleaned = value
    .replace(/\b(?:on|at)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday).*$/i, "")
    .replace(/\b(?:for|around|about)\s+\d{1,4}\s+(?:people|students|participants).*$/i, "")
    .replace(/\b(?:need|with)\s+(?:a\s+)?(?:projector|mic|sound|stage).*$/i, "")
    .replace(/[,.]+$/, "")
    .trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trim()}…` : cleaned;
}

function inferTitle(text: string, category: string) {
  const forMatch = text.match(/\bfor\s+(?:an?\s+|the\s+)?(.+?)(?=\s+on\b|\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|,|\s+at\s+\d|\s+from\s+\d|$)/i);
  if (forMatch) {
    const value = cleanTitle(forMatch[1]);
    if (value.length >= 3 && !/^\d+\s*(?:people|students)/i.test(value)) return value;
  }
  const eventMatch = text.match(/\b([A-Za-z][A-Za-z -]{2,45}(?:workshop|contest|farewell|lecture|seminar|meeting|rehearsal|concert|session|talk|event|finals?|exhibition))\b/i);
  if (eventMatch) return cleanTitle(eventMatch[1]);
  const fallback: Record<string, string> = {
    workshop: "Workshop",
    seminar: "Seminar / guest lecture",
    cultural: "Cultural programme",
    sports: "Sports event",
    meeting: "Meeting",
    department_event: "Department event",
    club_event: "Club event",
  };
  return fallback[category] ?? "Venue request";
}

export function parsePlainLanguageBooking(input: BookingParseInput): BookingParseDraft {
  const text = input.text.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const assumptions: string[] = [];
  const followUp: string[] = [];

  const parsedDate = parseDate(text, input.today, input.minDate);
  let date = parsedDate.date;
  if (!date) followUp.push("Which date or weekday should this booking use?");
  if (date && date < input.minDate) {
    followUp.push(`The requested date is before the earliest permitted date (${input.minDate}); please choose a later date.`);
  }

  const times = parseTimes(text);
  assumptions.push(...times.assumptions);
  followUp.push(...times.followUp);
  if (times.start !== null && times.end !== null && times.end - times.start > input.maxHours * 60) {
    followUp.push(`This request is longer than the ${input.maxHours}-hour booking limit; shorten or split it.`);
  }

  const attendees = parseAttendees(text);
  if (!attendees) followUp.push("How many people are expected?");

  const room = parseRoom(text);
  const needs = parseNeeds(text);
  const accessible = needs.includes("Accessibility");
  const category = inferCategory(text, input.mode);
  const title = inferTitle(text, category);
  if (["Workshop", "Seminar / guest lecture", "Cultural programme", "Sports event", "Meeting", "Department event", "Club event"].includes(title)) {
    assumptions.push(`A temporary title (“${title}”) was filled in; replace it with the event name if needed.`);
  }

  const recurring = /\b(every|daily|each day|all (?:of )?(?:fest )?week|roz|har din)\b/.test(lower) || parsedDate.days.length > 1;
  if (recurring) {
    followUp.push("This sounds recurring or mentions multiple days. This form submits one occurrence; review the first date, then submit the other dates separately.");
  }

  if (!room.code && !room.types.length) {
    assumptions.push("No venue type was stated; the smallest active venue with enough seats will be proposed.");
  }
  if (parsedDate.days.length > 1 && date) assumptions.push(`The first matching day (${date}) was filled into this single-booking form.`);

  return {
    title,
    category,
    description: `Plain-language request: “${text.slice(0, 450)}”`,
    date,
    startTime: times.start === null ? null : timeString(times.start),
    endTime: times.end === null ? null : timeString(times.end),
    attendees,
    roomCodeHint: room.code,
    roomTypeHints: room.types,
    needs,
    accessible,
    assumptions,
    followUp,
    recurring,
  };
}
