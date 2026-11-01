import { Building2, CheckCheck, Megaphone, Send } from "lucide-react";
import type { Metadata } from "next";
import { InlineAction } from "@/components/client";
import { NotificationList } from "@/components/domain";
import { NoticeCampaignList, NoticeComposer } from "@/components/notices";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { markAllNotificationsReadAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { getRef, listNoticeCampaigns, listNotifications } from "@/lib/queries";

export const metadata: Metadata = { title: "Notices" };

export default async function CoordinatorNoticesPage() {
  const user = await requireRole("coordinator");
  const [ref, items, campaigns] = await Promise.all([
    getRef(),
    listNotifications(user.id),
    listNoticeCampaigns({ actorId: user.id }),
  ]);
  const department = user.departmentId ? ref.departments.find((item) => item.id === user.departmentId) ?? null : null;
  const departmentNames = new Map(ref.departments.map((item) => [item.id, item.name]));
  const unread = items.filter((item) => !item.read).length;

  return (
    <>
      <PageHeader
        eyebrow={user.departmentName ?? "Department"}
        title="Notices"
        description="Receive operational updates and publish department-scoped notices with acknowledgement tracking."
        actions={
          unread > 0 ? (
            <InlineAction action={markAllNotificationsReadAction} fields={{ all: 1 }} size="md" icon={<CheckCheck />}>
              Acknowledge all
            </InlineAction>
          ) : undefined
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <CardHeader icon={Send} title="Publish to your department" description="Server-side scope prevents delivery outside your department." />
          {department ? (
            <NoticeComposer departments={ref.departments} fixedDepartment={department} />
          ) : (
            <EmptyState
              icon={Building2}
              title="No department assigned"
              description="Ask an administrator to assign this coordinator account to a department before publishing notices."
              compact
            />
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader
            icon={Megaphone}
            title="Your notice inbox"
            description={unread ? `${unread} awaiting acknowledgement of ${items.length}` : `${items.length} notices · all acknowledged`}
          />
          <NotificationList items={items} />
        </Card>
      </div>

      <Card className="mt-6 min-w-0">
        <CardHeader
          icon={Megaphone}
          title="Notices you published"
          description="Delivery totals include faculty and coordinators in your department."
        />
        <NoticeCampaignList campaigns={campaigns} departmentNames={departmentNames} empty="You have not published a department notice yet" />
      </Card>
    </>
  );
}
