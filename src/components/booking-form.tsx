"use client";

import { Send, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { BOOKING_CATEGORIES, BOOKING_NEEDS, ROOM_TYPE_LABEL, type RoomType } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";
import { ActionForm, FormAlert, FormField, SubmitButton, useActionForm } from "./client";
import { Input, Select, Textarea, buttonClasses } from "./ui";

type VenueOption = { id: number; code: string; name: string; capacity: number; type: RoomType; building: string; status: string };
type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  venues: VenueOption[];
  defaults?: { roomId?: number; date?: string; startTime?: string; endTime?: string };
  mode: "club" | "department";
  minDate: string;
  leadDays: number;
  maxHours: number;
};

function Fields({ venues, defaults = {}, mode, minDate, leadDays, maxHours }: Omit<Props, "action">) {
  const { state } = useActionForm();
  const [roomId, setRoomId] = useState(defaults.roomId ? String(defaults.roomId) : "");
  const [attendees, setAttendees] = useState("");
  const selected = venues.find((v) => String(v.id) === roomId);
  const suggestions = state && !state.ok ? state.suggestions ?? [] : [];
  const over = selected && attendees !== "" && Number(attendees) > selected.capacity;

  return (
    <div className="space-y-6">
      <FormAlert />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-ink">Event details</legend>
        <FormField name="title" label="Event title" required className="sm:col-span-2">
          <Input id="title" name="title" placeholder={mode === "club" ? "e.g. RoboWars Qualifier Round" : "e.g. Guest lecture: AI in Healthcare"} maxLength={120} />
        </FormField>
        <FormField name="category" label="Category" required>
          <Select id="category" name="category" defaultValue={mode === "club" ? "club_event" : "department_event"}>
            {BOOKING_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField name="priority" label="Priority" hint="High priority requests are reviewed first.">
          <Select id="priority" name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            {mode === "department" && <option value="critical">Critical</option>}
          </Select>
        </FormField>
        <FormField name="description" label="Description" hint="Purpose, audience and anything the venue team should prepare." className="sm:col-span-2">
          <Textarea id="description" name="description" maxLength={600} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-3 text-sm font-semibold text-ink">Schedule &amp; venue</legend>
        <FormField name="date" label="Date" required hint={leadDays ? `At least ${leadDays} day(s) notice.` : undefined}>
          <Input id="date" name="date" type="date" min={minDate} defaultValue={defaults.date} />
        </FormField>
        <FormField name="startTime" label="Start time" required>
          <Input id="startTime" name="startTime" type="time" defaultValue={defaults.startTime ?? "17:00"} />
        </FormField>
        <FormField name="endTime" label="End time" required hint={`Up to ${maxHours} hours.`}>
          <Input id="endTime" name="endTime" type="time" defaultValue={defaults.endTime ?? "19:00"} />
        </FormField>
        <FormField name="attendees" label="Expected attendees" required>
          <Input id="attendees" name="attendees" type="number" min={1} inputMode="numeric" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        </FormField>
        <FormField name="roomId" label="Venue" required className="sm:col-span-2 lg:col-span-4">
          <Select id="roomId" name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Select a venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id} disabled={v.status !== "active"}>
                {v.code} · {v.name} — {v.capacity} seats · {ROOM_TYPE_LABEL[v.type]}
                {v.status !== "active" ? " (unavailable)" : ""}
              </option>
            ))}
          </Select>
        </FormField>
        {selected && (
          <p className="text-xs text-ink-2 sm:col-span-2 lg:col-span-4">
            {selected.building} · seats {selected.capacity}
            {over && (
              <span className="ml-2 inline-flex items-center gap-1 font-medium text-warning-fg">
                <TriangleAlert className="size-3.5" aria-hidden /> Attendance exceeds capacity
              </span>
            )}
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 sm:col-span-2 lg:col-span-4" role="status">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-800">
              <Sparkles className="size-4" aria-hidden /> Conflict-free alternatives for this time
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s.id} type="button" onClick={() => setRoomId(String(s.id))} className={buttonClasses(String(s.id) === roomId ? "primary" : "secondary", "sm")}>
                  {s.code} · {s.name} ({s.capacity})
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-brand-800/80">Select one, then submit again — availability is re-checked on submission.</p>
          </div>
        )}
      </fieldset>

      <fieldset className="border-t border-line pt-6">
        <legend className="mb-3 text-sm font-semibold text-ink">Requirements</legend>
        <div className="flex flex-wrap gap-2">
          {BOOKING_NEEDS.map((n) => (
            <label
              key={n}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink transition-colors hover:border-line-strong has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
            >
              <input type="checkbox" name="needs" value={n} className="size-4 accent-brand-600" />
              {n}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-3">Availability is checked against the timetable, exams and approved bookings.</p>
        <SubmitButton icon={<Send />} pendingLabel="Checking availability…">
          Submit request
        </SubmitButton>
      </div>
    </div>
  );
}

export function BookingForm({ action, ...rest }: Props) {
  return (
    <ActionForm action={action} aria-label="Venue booking request">
      <Fields {...rest} />
    </ActionForm>
  );
}
