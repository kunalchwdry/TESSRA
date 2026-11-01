import { Megaphone, Send, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { NoticeCampaignList, NoticeComposer } from "@/components/notices";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRef, listNoticeCampaigns } from "@/lib/queries";

export const metadata: Metadata = { title: "Notices" };

export default async function AdminNoticesPage() {
  await requireRole("admin");
  const [ref, campaigns] = await Promise.all([getRef(), listNoticeCampaigns()]);
  const departmentNames = new Map(ref.departments.map((department) => [department.id, department.name]));

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Targeted Notices"
        description="Publish actionable campus updates to the people affected, then monitor acknowledgement without exposing notices to unrelated accounts."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={Send}
              title="Publish a notice"
              description="Choose a role or department audience. Every recipient receives an individual, private inbox copy."
            />
            <NoticeComposer departments={ref.departments} />
          </Card>

          <Card>
            <CardHeader icon={ShieldCheck} title="Safe delivery rules" />
            <CardBody>
              <ul className="space-y-2 text-[13px] leading-5 text-ink-2">
                <li>• Only approved Admin and Coordinator accounts can publish.</li>
                <li>• Coordinators are restricted to their own department.</li>
                <li>• Recipients can acknowledge only their own copy.</li>
                <li>• Publication is atomic and recorded in Audit &amp; History.</li>
                <li>• Existing timetable and booking alerts also remain visible in the same Notices inbox.</li>
              </ul>
            </CardBody>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader
            icon={Megaphone}
            title="Delivery & acknowledgement"
            description={`${campaigns.length} recent notice campaign${campaigns.length === 1 ? "" : "s"}`}
          />
          <NoticeCampaignList campaigns={campaigns} departmentNames={departmentNames} />
        </Card>
      </div>
    </>
  );
}
