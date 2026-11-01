import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  ClipboardClock,
  Gauge,
  HeartPulse,
  Info,
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

const STATE_LABEL: Record<CampusHealthState, string> = {
  healthy: "Healthy",
  stable: "Stable",
  watch: "Watch",
  risk: "Action needed",
  unavailable: "Not scored",
};

export function CampusHealthDashboard({ report }: { report: CampusHealthReport }) {
  return (
    <section aria-labelledby="campus-health-heading" className="mb-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line bg-gradient-to-r from-brand-50/90 via-surface to-surface px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" dot>Live operational snapshot</Badge>
              <span className="text-xs text-ink-3">Calculated {formatDateTime(report.generatedAt)}</span>
            </div>
            <h2 id="campus-health-heading" className="mt-2 text-lg font-semibold text-ink">Campus operational health</h2>
            <p className="mt-0.5 max-w-3xl text-[13px] leading-5 text-ink-2">
              One deterministic score built from six current campus indicators. Every weight, source and formula is shown below—no AI estimation or hidden inputs.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-2">
            <Info className="size-4 text-ink-3" aria-hidden />
            {report.activeWeight}% of configured weight currently scored
          </div>
        </div>

        <div className="grid lg:grid-cols-[270px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center border-b border-line bg-subtle/50 px-6 py-7 text-center lg:border-b-0 lg:border-r">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <HeartPulse className="size-5" aria-hidden />
            </span>
            <div className="mt-4">
              <Ring value={report.score ?? 0} size={116} label="Overall campus operational health" />
            </div>
            <Badge tone={STATE_TONE[report.state]} className="mt-3">{report.stateLabel}</Badge>
            <p className="mt-3 text-xs leading-5 text-ink-2">
              Weighted mean of {report.availableCount} available indicator{report.availableCount === 1 ? "" : "s"}.
              {report.excludedWeight > 0 ? ` ${report.excludedWeight}% is excluded because its source has no data.` : " All configured indicators are included."}
            </p>
          </div>

          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
            {report.indicators.map((indicator) => {
              const Icon = ICONS[indicator.key];
              return (
                <article key={indicator.key} className="flex min-h-[230px] flex-col bg-surface p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-ink-2 ring-1 ring-line">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge tone={STATE_TONE[indicator.state]}>{STATE_LABEL[indicator.state]}</Badge>
                      <Badge tone="outline">Weight {indicator.weight}%</Badge>
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">{indicator.label}</h3>
                    <span className="tabular shrink-0 text-lg font-semibold text-ink">{indicator.score === null ? "—" : indicator.score}</span>
                  </div>
                  {indicator.score !== null && (
                    <ProgressBar
                      value={indicator.score}
                      label={`${indicator.label} score`}
                      tone={indicator.state === "risk" ? "danger" : indicator.state === "watch" ? "warning" : indicator.state === "stable" ? "info" : "brand"}
                      className="mt-2"
                    />
                  )}
                  <p className="mt-3 text-[13px] font-medium leading-5 text-ink">{indicator.value}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-2">{indicator.explanation}</p>

                  <div className="mt-auto border-t border-line pt-3 text-[11px] leading-4 text-ink-3">
                    <p><span className="font-semibold text-ink-2">Formula:</span> {indicator.formula}</p>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                      <p><span className="font-semibold text-ink-2">Source:</span> {indicator.source}</p>
                      {indicator.href && (
                        <Link href={indicator.href} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-700 hover:underline">
                          Open <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="border-t border-line bg-subtle px-5 py-3 text-xs leading-5 text-ink-2 sm:px-6">
          <strong className="text-ink">Overall formula:</strong> sum of each available indicator score × its displayed weight, divided by the total available weight. Missing source data is excluded rather than treated as zero.
        </div>
      </Card>
    </section>
  );
}
