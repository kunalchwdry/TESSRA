import { CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { InlineAction } from "@/components/client";
import { NotificationList } from "@/components/domain";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { markAllNotificationsReadAction } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { listNotifications } from "@/lib/queries";

export const metadata: Metadata = { title: "Notices" };

export default async function ClubNotificationsPage() {
  const user = await requireRole("club");
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.read).length;
  return (
    <>
      <PageHeader
        eyebrow={user.clubName ?? "Club"}
        title="Notices"
        description="Targeted announcements, booking decisions, venue changes and reminders."
        actions={
          unread > 0 ? (
            <InlineAction action={markAllNotificationsReadAction} fields={{ all: 1 }} size="md" icon={<CheckCheck />}>
              Acknowledge all
            </InlineAction>
          ) : undefined
        }
      />
      <Card>
        <CardHeader title="Notice inbox" description={unread ? `${unread} awaiting acknowledgement of ${items.length}` : `${items.length} notices · all acknowledged`} />
        <NotificationList items={items} />
      </Card>
    </>
  );
}
