import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  ChevronDown,
  ClipboardClock,
  Gauge,
  HeartPulse,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import type { CampusHealthIndicatorKey, CampusHealthReport, CampusHealthState } from "@/lib/campus-health";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, ProgressBar, Ring, type Tone } from "@/components/ui";

const ICONS: Record<CampusHealthIndicatorKey, LucideIcon> = {
  academic: BookOpenCheck,
  faculty: UserRoundCheck,
  rooms: Building2,
  requests: ClipboardClock,
  events: CalendarCheck,
  scheduling: Gauge,
};

const STATE_TONE: Record<CampusHealthState, Tone> = {
  healthy: "success",
  stable: "info",
  watch: "warning",
  risk: "danger",
  unavailable: "neutral",
};

function progressTone(state: CampusHealthState) {
  if (state === "risk") return "danger" as const;
  if (state === "watch") return "warning" as const;
  if (state === "stable") return "info" as const;
  return "brand" as const;
}

export function CampusHealthDashboard({ report }: { report: CampusHealthReport }) {
  return (
    <section aria-labelledby="campus-health-heading" className="mb-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <HeartPulse className="size-4" aria-hidden />
              </span>
              <Badge tone="brand" dot>Live</Badge>
              <span className="text-xs text-ink-3">Updated {formatDateTime(report.generatedAt)}</span>
            </div>
            <h2 id="campus-health-heading" className="mt-3 text-lg font-semibold text-ink">Campus health</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">A quick view of current academic and operational performance.</p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Ring value={report.score ?? 0} size={76} label="Overall campus health" />
            <div>
              <Badge tone={STATE_TONE[report.state]}>{report.stateLabel}</Badge>
              <p className="mt-1.5 text-xs text-ink-3">{report.availableCount}/6 indicators scored</p>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {report.indicators.map((indicator) => {
            const Icon = ICONS[indicator.key];
            return (
              <article key={indicator.key} className="bg-surface p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-ink-2">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-semibold text-ink">{indicator.label}</h3>
                      <p className="text-[11px] text-ink-3">Weight {indicator.weight}%</p>
                    </div>
                  </div>
                  <span className="tabular shrink-0 text-xl font-semibold text-ink">{indicator.score === null ? "—" : indicator.score}</span>
                </div>

                {indicator.score !== null ? (
                  <ProgressBar value={indicator.score} label={`${indicator.label} score`} tone={progressTone(indicator.state)} className="mt-3" />
                ) : (
                  <div className="mt-3 h-1.5 rounded-full bg-muted-bg" aria-label={`${indicator.label} is not scored`} />
                )}

                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-xs leading-5 text-ink-2">{indicator.value}</p>
                  {indicator.href && (
                    <Link href={indicator.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                      Open <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <details className="group border-t border-line bg-subtle/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] font-medium text-ink sm:px-6">
            <span>How scoring works</span>
            <ChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <p className="mb-4 text-xs leading-5 text-ink-2">
              Overall score = weighted mean of available indicators. Missing data is excluded rather than counted as zero.
              {report.excludedWeight > 0 ? ` Currently ${report.excludedWeight}% of configured weight is excluded.` : " All configured indicators are included."}
            </p>
            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {report.indicators.map((indicator) => (
                <div key={indicator.key} className="rounded-lg border border-line bg-surface p-3">
                  <dt className="text-xs font-semibold text-ink">{indicator.label}</dt>
                  <dd className="mt-1 text-[11px] leading-4 text-ink-2">{indicator.formula}</dd>
                  <dd className="mt-1 text-[11px] leading-4 text-ink-3">Source: {indicator.source}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      </Card>
    </section>
  );
}
