import { Check, Clock, Mail, UserPlus, X } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole, requireUser } from "@/lib/auth";
import { RoleShell } from "@/components/role-shell";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient, isConfigured } from "@/lib/supabase/server";
import { db } from "@/db";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { fail, ok } from "@/lib/utils";

export const metadata: Metadata = { title: "Access Requests" };
export const dynamic = "force-dynamic";

/** Wrapper for Next.js <form action> — server action with admin/coordinator auth. */
export async function approveAccessRequestForm(fd: FormData) {
  "use server";
  const user = await requireUser();
  if (!user || (user.role !== "admin" && user.role !== "coordinator")) {
    throw new Error("Admin or Coordinator access required.");
  }
  const id = Number(fd.get("id"));
  const note = (fd.get("note") as string) || null;

  const [req] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.id, id));
  if (!req || req.status !== "pending") {
    throw new Error("This request is no longer pending.");
  }

  const [existingUser] = await db.select().from(t.users).where(eq(t.users.email, req.email)).limit(1);
  if (existingUser) throw new Error("An account with this email already exists.");

  // Hash plain password for local storage, keep plain for Supabase Auth
  const localPasswordHash = hashPassword(req.passwordHash);

  const [newUser] = await db
    .insert(t.users)
    .values({
      name: req.name,
      email: req.email,
      passwordHash: localPasswordHash,
      role: req.requestedRole,
      departmentId: req.departmentId,
      clubId: req.clubId,
      approvalStatus: "approved",
    })
    .returning();

  // Create matching Supabase Auth user if configured
  if (isConfigured) {
    const supabase = await createSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.admin.createUser({
          email: req.email,
          password: req.passwordHash, // Plain password for Supabase Auth
          email_confirm: true,
          user_metadata: { role: req.requestedRole, name: req.name },
        });
      } catch (err) {
        console.warn("Supabase auth user creation failed:", err);
        // Non-fatal — local account is created, but sign-in via Supabase won't work
      }
    }
  }

  await db
    .update(t.accessRequests)
    .set({ status: "approved", reviewedById: newUser.id, reviewNote: note, reviewedAt: new Date() })
    .where(eq(t.accessRequests.id, id));

  revalidatePath("/admin/access-requests");
}

export async function rejectAccessRequestForm(fd: FormData) {
  "use server";
  const user = await requireUser();
  if (!user || (user.role !== "admin" && user.role !== "coordinator")) {
    throw new Error("Admin or Coordinator access required.");
  }
  const id = Number(fd.get("id"));
  const reason = (fd.get("reason") as string) || "";

  const [req] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.id, id));
  if (!req || req.status !== "pending") {
    throw new Error("This request is no longer pending.");
  }
  if (reason.length < 5) {
    throw new Error("Please explain why the request is rejected.");
  }

  await db
    .update(t.accessRequests)
    .set({ status: "rejected", reviewNote: reason, reviewedAt: new Date() })
    .where(eq(t.accessRequests.id, id));

  revalidatePath("/admin/access-requests");
}

export default async function AccessRequestsPage() {
  const user = await requireUser();
  if (!user || (user.role !== "admin" && user.role !== "coordinator")) {
    redirect("/login");
  }
  const [requests] = await Promise.all([
    db
      .select({
        id: t.accessRequests.id,
        name: t.accessRequests.name,
        email: t.accessRequests.email,
        requestedRole: t.accessRequests.requestedRole,
        departmentId: t.accessRequests.departmentId,
        clubId: t.accessRequests.clubId,
        reason: t.accessRequests.reason,
        status: t.accessRequests.status,
        reviewNote: t.accessRequests.reviewNote,
        reviewedAt: t.accessRequests.reviewedAt,
        createdAt: t.accessRequests.createdAt,
        reviewerName: t.users.name,
      })
      .from(t.accessRequests)
      .leftJoin(t.users, eq(t.users.id, t.accessRequests.reviewedById))
      .orderBy(t.accessRequests.createdAt),
  ]);

  return (
    <RoleShell role="admin">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Access Requests</h1>
            <p className="text-sm text-ink-2">Review and approve or reject new account requests.</p>
          </div>
          <a href="/admin/create-account" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2 hover:bg-subtle hover:text-ink transition-colors">
            <UserPlus className="size-4" aria-hidden />
            Create Account
          </a>
        </div>

        <div className="rounded-xl border border-line bg-surface shadow-card overflow-x-auto">
          <div className="min-w-[850px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Requested Role</th>
                <th className="text-left px-4 py-3 font-semibold">Department / Club</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Reviewed By</th>
                <th className="text-left px-4 py-3 font-semibold">Requested</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const statusColor =
                  r.status === "approved"
                    ? "bg-green-50 text-green-700"
                    : r.status === "rejected"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-700";
                const statusIcon =
                  r.status === "approved" ? <Check size={14} strokeWidth={2.5} /> : r.status === "rejected" ? <X size={14} strokeWidth={2.5} /> : <Clock size={14} strokeWidth={2.5} />;
                const org = "—";
                return (
                  <tr key={r.id} className="border-b border-line hover:bg-surface/50">
                    <td className="px-4 py-3 text-ink">{r.name}</td>
                    <td className="px-4 py-3 text-ink-2">{r.email}</td>
                    <td className="px-4 py-3 text-ink-2">{r.requestedRole.charAt(0).toUpperCase() + r.requestedRole.slice(1)}</td>
                    <td className="px-4 py-3 text-ink-2">{org}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
                        {statusIcon} {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{r.reviewerName ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {r.status === "pending" ? (
                        <>
                          <form action={approveAccessRequestForm} className="inline">
                            <input type="hidden" name="id" value={String(r.id)} />
                            <input type="hidden" name="note" value="Approved via Approval Centre" />
                            <button
                              type="submit"
                              className="rounded-xl bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                            >
                              Approve
                            </button>
                          </form>
                          <form action={rejectAccessRequestForm} className="inline ml-2">
                            <input type="hidden" name="id" value={String(r.id)} />
                            <input type="hidden" name="reason" value="Not approved by administrator" />
                            <button
                              type="submit"
                              className="rounded-xl border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                            >
                              Reject
                            </button>
                          </form>
                        </>
                      ) : (
                        <span className="text-ink-3">{r.reviewNote ?? ""}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-ink-3">
                    No access requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {requests.some((r) => r.status === "pending") && (
          <div className="rounded-xl border border-line bg-amber-50 p-4 text-amber-900">
            <p className="text-sm font-semibold">Pending requests require your review.</p>
            <p className="mt-1 text-xs text-amber-800/80">
              Approving a request creates the user account with the requested role. Rejected applicants cannot sign in.
            </p>
          </div>
        )}
      </div>
    </RoleShell>
  );
}
