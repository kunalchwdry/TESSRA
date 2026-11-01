import { CircleCheck, Megaphone, Send, Users } from "lucide-react";
import { ActionForm, FormAlert, FormField, SubmitButton } from "@/components/client";
import { Badge, EmptyState, Input, Select, Textarea } from "@/components/ui";
import { publishNoticeAction } from "@/lib/actions";
import {
  NOTICE_AUDIENCES,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABEL,
  noticeAudienceLabel,
  type NoticeCategory,
} from "@/lib/notices";
import type { NoticeCampaignView } from "@/lib/queries";
import { formatRelative } from "@/lib/utils";

const CATEGORY_TONE: Record<NoticeCategory, "danger" | "warning" | "success" | "info" | "neutral"> = {
  urgent: "danger",
  timetable: "warning",
  room: "warning",
  exam: "warning",
  event: "success",
  general: "info",
};

type DepartmentOption = { id: number; code: string; name: string };

export function NoticeComposer({
  departments,
  fixedDepartment,
}: {
  departments: DepartmentOption[];
  fixedDepartment?: DepartmentOption | null;
}) {
  return (
    <ActionForm action={publishNoticeAction} resetOnSuccess className="space-y-4 p-5" aria-label="Publish a targeted notice">
      {fixedDepartment ? (
        <>
          <input type="hidden" name="audience" value="department" />
          <input type="hidden" name="departmentId" value={fixedDepartment.id} />
          <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5 text-[13px] leading-5 text-brand-800">
            This notice will go only to approved faculty and coordinators in <strong>{fixedDepartment.name}</strong>. The server enforces this scope.
          </div>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="audience" label="Audience" required hint="Only approved accounts receive a copy.">
            <Select id="audience" name="audience" defaultValue="all">
              {NOTICE_AUDIENCES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField name="departmentId" label="Department" hint="Used only when the audience is One department.">
            <Select id="departmentId" name="departmentId" defaultValue={departments[0]?.id ?? ""}>
              <option value="">Select a department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.code} · {department.name}</option>
              ))}
            </Select>
          </FormField>
        </div>
      )}

      <FormField name="category" label="Category" required>
        <Select id="category" name="category" defaultValue="general">
          {NOTICE_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>{item.label} — {item.description}</option>
          ))}
        </Select>
      </FormField>
      <FormField name="title" label="Title" required hint="A short, specific summary. Maximum 100 characters.">
        <Input id="title" name="title" minLength={5} maxLength={100} placeholder="DSP Lab moved to ECE Lab 4" />
      </FormField>
      <FormField name="body" label="Message" required hint="Include what changed, when it applies and what the recipient should do.">
        <Textarea id="body" name="body" minLength={10} maxLength={600} rows={5} placeholder="Today's 2:00 PM DSP Lab session will be held in ECE Lab 4. Please acknowledge this notice before class." />
      </FormField>
      <FormAlert />
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs leading-5 text-ink-3">Publishing is immediate and recorded in the audit history.</p>
        <SubmitButton icon={<Send />} pendingLabel="Publishing…">Publish notice</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NoticeCampaignList({
  campaigns,
  departmentNames,
  empty = "No notices published yet",
}: {
  campaigns: NoticeCampaignView[];
  departmentNames: Map<number, string>;
  empty?: string;
}) {
  if (!campaigns.length) {
    return <EmptyState icon={Megaphone} title={empty} description="Published notice campaigns and acknowledgement totals will appear here." compact />;
  }

  return (
    <ol className="divide-y divide-line">
      {campaigns.map((campaign) => {
        const percentage = campaign.delivered ? Math.round((campaign.acknowledged / campaign.delivered) * 100) : 0;
        const audience = noticeAudienceLabel(
          campaign.audience,
          campaign.departmentId ? departmentNames.get(campaign.departmentId) : null,
        );
        return (
          <li key={campaign.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={CATEGORY_TONE[campaign.category]}>{NOTICE_CATEGORY_LABEL[campaign.category]}</Badge>
                  <Badge tone="outline" icon={Users}>{audience}</Badge>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink">{campaign.title}</h3>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-ink-2">{campaign.body}</p>
              </div>
              <div className="min-w-28 rounded-lg bg-subtle px-3 py-2 text-right ring-1 ring-line">
                <p className="tabular text-sm font-semibold text-ink">{campaign.acknowledged}/{campaign.delivered}</p>
                <p className="text-[11px] text-ink-3">acknowledged</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted-bg" aria-label={`${percentage}% acknowledged`}>
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${percentage}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
              <span>Published by {campaign.actorName} · {formatRelative(campaign.createdAt)}</span>
              <span className="inline-flex items-center gap-1 font-medium text-ink-2"><CircleCheck className="size-3.5" aria-hidden /> {percentage}% read</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
