"use server";

import { db } from "@/db";
import * as t from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { eq } from "drizzle-orm";

export async function submitAccessRequest(prevState: any, fd: FormData) {
  const name = (fd.get("name") as string)?.trim();
  const email = (fd.get("email") as string)?.toLowerCase().trim();
  const password = (fd.get("password") as string) ?? "";
  const requestedRole = (fd.get("requestedRole") as string) ?? "";
  const departmentId = Number(fd.get("departmentId")) || null;
  const clubId = Number(fd.get("clubId")) || null;
  const reason = (fd.get("reason") as string)?.trim();

  const errors: Record<string, string> = {};
  if (!name || name.length < 2) errors.name = "Enter your full name";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address";
  if (!password || password.length < 8) errors.password = "Password must be at least 8 characters";
  if (!["coordinator", "faculty", "club"].includes(requestedRole)) errors.requestedRole = "Select a valid role";
  if (!reason || reason.length < 10) errors.reason = "Please explain why you need access (10+ characters)";
  if (Object.keys(errors).length) return { ok: false, message: "Please fix the highlighted fields.", errors };

  const [existingUser] = await db.select().from(t.users).where(eq(t.users.email, email)).limit(1);
  if (existingUser) return { ok: false, message: "An account with this email already exists. Please sign in instead.", redirectTo: "/login" };
  const [existingRequest] = await db.select().from(t.accessRequests).where(eq(t.accessRequests.email, email)).limit(1);
  if (existingRequest) {
    return { ok: false, message: "You already have a pending access request. Wait for admin review." };
  }

  const passwordHash = hashPassword(password);
  const [reqRow] = await db
    .insert(t.accessRequests)
    .values({
      name,
      email,
      passwordHash,
      requestedRole: requestedRole as "coordinator" | "faculty" | "club",
      departmentId,
      clubId,
      reason,
      status: "pending",
    })
    .returning();

  return { ok: true, message: "Access request submitted. An admin will review it shortly.", id: reqRow.id };
}
