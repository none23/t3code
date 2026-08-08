import type { UsageProviderKind } from "@t3tools/contracts";
import { useMemo } from "react";

import type { DailyTotals } from "../../usage/usageMerge";
import { formatDayShort, formatTokens, formatUsd } from "../../usage/usageFormat";
import { PROVIDER_COLOR, PROVIDER_LABEL, PROVIDER_ORDER } from "./usageProviders";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 260;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24;

export type UsageChartMetric = "tokens" | "cost";

interface UsageProviderChartProps {
  readonly days: readonly string[];
  readonly daily: readonly DailyTotals[];
  readonly metric: UsageChartMetric;
}

function valueFor(
  daily: DailyTotals | undefined,
  provider: UsageProviderKind,
  metric: UsageChartMetric,
): number {
  const entry = daily?.byProvider.get(provider);
  if (entry === undefined) return 0;
  return metric === "tokens" ? entry.totalTokens : entry.costUsd;
}

/**
 * Stacked daily area, one band per provider.
 *
 * Rendered as a plain SVG rather than pulled from a charting library: the page
 * needs one chart, and a static path avoids shipping a dependency and any
 * repainting animation.
 */
export function UsageProviderChart({ days, daily, metric }: UsageProviderChartProps) {
  const byDay = useMemo(() => new Map(daily.map((entry) => [entry.day, entry])), [daily]);

  const { paths, peak } = useMemo(() => {
    if (days.length === 0) return { paths: [], peak: 0 };

    const stacked = days.map((day) => {
      const entry = byDay.get(day);
      let running = 0;
      return PROVIDER_ORDER.map((provider) => {
        const base = running;
        running += valueFor(entry, provider, metric);
        return { provider, base, top: running };
      });
    });

    const peakValue = stacked.reduce(
      (max, columns) => Math.max(max, columns[columns.length - 1]?.top ?? 0),
      0,
    );
    const scale = peakValue === 0 ? 0 : (VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM) / peakValue;
    const stepX = days.length === 1 ? 0 : VIEW_WIDTH / (days.length - 1);
    const toY = (value: number) => VIEW_HEIGHT - PADDING_BOTTOM - value * scale;

    const built = PROVIDER_ORDER.map((provider, providerIndex) => {
      const top = stacked
        .map((columns, dayIndex) => {
          const column = columns[providerIndex];
          return `${dayIndex === 0 ? "M" : "L"}${(dayIndex * stepX).toFixed(2)},${toY(column?.top ?? 0).toFixed(2)}`;
        })
        .join(" ");
      const bottom = stacked
        .map((columns, dayIndex) => {
          const reversed = stacked.length - 1 - dayIndex;
          const column = stacked[reversed]?.[providerIndex];
          return `L${(reversed * stepX).toFixed(2)},${toY(column?.base ?? 0).toFixed(2)}`;
        })
        .join(" ");
      return { provider, d: `${top} ${bottom} Z` };
    });

    return { paths: built, peak: peakValue };
  }, [byDay, days, metric]);

  const firstDay = days[0];
  const middleDay = days[Math.floor(days.length / 2)];
  const lastDay = days[days.length - 1];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <div className="flex w-14 shrink-0 flex-col justify-between pt-1 pb-6 text-[10px] text-muted-foreground tabular-nums">
          <span>{metric === "tokens" ? formatTokens(peak) : formatUsd(peak)}</span>
          <span>{metric === "tokens" ? formatTokens(peak / 2) : formatUsd(peak / 2)}</span>
          <span>0</span>
        </div>
        <svg
          className="h-56 w-full"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Daily ${metric === "tokens" ? "processed tokens" : "cost"} by provider`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = PADDING_TOP + (VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM) * fraction;
            return (
              <line
                key={fraction}
                x1={0}
                x2={VIEW_WIDTH}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                className="text-border"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {paths.map(({ provider, d }) => (
            <path
              key={provider}
              d={d}
              fill={PROVIDER_COLOR[provider]}
              fillOpacity={0.55}
              stroke={PROVIDER_COLOR[provider]}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div className="flex justify-between pl-16 text-[10px] text-muted-foreground uppercase">
        <span>{firstDay === undefined ? "" : formatDayShort(firstDay)}</span>
        <span>{middleDay === undefined ? "" : formatDayShort(middleDay)}</span>
        <span>{lastDay === undefined ? "" : formatDayShort(lastDay)}</span>
      </div>
    </div>
  );
}

export function UsageChartLegend() {
  return (
    <div className="flex items-center gap-4">
      {PROVIDER_ORDER.map((provider) => (
        <span key={provider} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: PROVIDER_COLOR[provider] }}
          />
          {PROVIDER_LABEL[provider]}
        </span>
      ))}
    </div>
  );
}
