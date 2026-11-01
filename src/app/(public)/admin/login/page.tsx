import { BadgeCheck, Database, FileCheck2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark, Wordmark } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_ACCOUNTS, PRODUCT, ROLE_HOME, ROLE_LABEL } from "@/lib/constants";
import { getSettings } from "@/lib/queries";
import { LoginPanel } from "@/app/login/login-form";

export const metadata: Metadata = { title: "Administrator sign in" };
export const dynamic = "force-dynamic";

const ADMIN_FEATURES = [
  {
    icon: Database,
    title: "Official scheduling workspace",
    body: "Generate, inspect and validate timetable, examination and disruption runs from one control plane.",
  },
  {
    icon: FileCheck2,
    title: "Governed publication",
    body: "Review approvals, validator evidence and exact before-and-after changes before anything is published.",
  },
  {
    icon: BadgeCheck,
    title: "Traceable decisions",
    body: "Keep dataset identity, operational actions and audit history attached to every official decision.",
  },
];

export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);

  const settings = await getSettings();
  const adminAccounts = DEMO_ACCOUNTS.filter((account) => account.role === "admin").map((account) => ({
    ...account,
    roleLabel: ROLE_LABEL[account.role],
  }));

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="tile-pattern relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <LogoMark className="size-9 rounded-[9px] ring-1 ring-white/10" />
          <Wordmark inverted />
        </div>

        <div className="max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-300">Administrator control plane</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.15] tracking-[-0.02em] xl:text-[44px]">
            Validate. Govern.
            <br />
            <span className="text-brand-300">Publish with confidence.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-white/70">
            Secure access to TESSRA&apos;s official scheduling, approval and audit workflows.
          </p>

          <ul className="mt-10 space-y-5">
            {ADMIN_FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-brand-300 ring-1 ring-white/10">
                  <feature.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{feature.title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-white/60">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/40">
          {settings.institutionName} · {settings.academicTerm}
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <div className="flex items-center gap-3">
              <LogoMark className="size-9" />
              <Wordmark />
            </div>
            <a href="/login" className="text-xs font-medium text-brand-700 hover:underline">
              All workspaces
            </a>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
            <ShieldCheck className="size-3.5" aria-hidden />
            Restricted workspace
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.01em] text-ink">Administrator sign in</h2>
          <p className="mt-1.5 text-sm leading-6 text-ink-2">
            Use your approved administrator credentials to access {PRODUCT.name} campus operations.
          </p>

          <LoginPanel accounts={adminAccounts} variant="admin" loginPath="/admin/login" />
        </div>
      </main>
    </div>
  );
}
