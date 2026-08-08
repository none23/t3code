import type { UsageProviderKind } from "@t3tools/contracts";
import { useCallback, useMemo, useRef, useState } from "react";

import type { DailyTotals } from "../../usage/usageMerge";
import { formatDayShort, formatTokens, formatUsd } from "../../usage/usageFormat";
import { PROVIDER_COLOR, PROVIDER_LABEL, PROVIDER_ORDER } from "./usageProviders";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 260;
const TICK_COUNT = 4;

export type UsageChartMetric = "tokens" | "cost";

interface UsageProviderChartProps {
  readonly days: readonly string[];
  readonly daily: readonly DailyTotals[];
  readonly metric: UsageChartMetric;
}

interface Point {
  readonly x: number;
  readonly y: number;
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
 * Monotone cubic tangents (Fritsch-Carlson).
 *
 * Plain cubic smoothing overshoots on spiky daily data and would dip the area
 * below zero between points, which reads as negative spend. This variant is
 * shape-preserving, so a smoothed series never leaves the range of its samples.
 */
function monotoneTangents(points: readonly Point[]): readonly number[] {
  const count = points.length;
  if (count < 2) return [0];

  const slopes: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const dx = (points[index + 1]?.x ?? 0) - (points[index]?.x ?? 0);
    const dy = (points[index + 1]?.y ?? 0) - (points[index]?.y ?? 0);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  const tangents: number[] = Array.from({ length: count }, () => 0);
  tangents[0] = slopes[0] ?? 0;
  tangents[count - 1] = slopes[count - 2] ?? 0;
  for (let index = 1; index < count - 1; index += 1) {
    const previous = slopes[index - 1] ?? 0;
    const next = slopes[index] ?? 0;
    tangents[index] = previous * next <= 0 ? 0 : (previous + next) / 2;
  }

  for (let index = 0; index < count - 1; index += 1) {
    const slope = slopes[index] ?? 0;
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const a = (tangents[index] ?? 0) / slope;
    const b = (tangents[index + 1] ?? 0) / slope;
    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * a * slope;
      tangents[index + 1] = scale * b * slope;
    }
  }

  return tangents;
}

/** Smoothed polyline through `points`, as a sequence of cubic segments. */
function smoothSegments(points: readonly Point[], startCommand: "M" | "L"): string {
  if (points.length === 0) return "";
  const first = points[0];
  if (first === undefined) return "";
  if (points.length === 1) return `${startCommand}${first.x.toFixed(2)},${first.y.toFixed(2)}`;

  const tangents = monotoneTangents(points);
  let path = `${startCommand}${first.x.toFixed(2)},${first.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from === undefined || to === undefined) continue;
    const dx = to.x - from.x;
    const c1x = from.x + dx / 3;
    const c1y = from.y + ((tangents[index] ?? 0) * dx) / 3;
    const c2x = to.x - dx / 3;
    const c2y = to.y - ((tangents[index + 1] ?? 0) * dx) / 3;
    path += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
  }

  return path;
}

/** Rounds a scale maximum up to a readable 1/2/5 x 10^n step. */
function niceTicks(peak: number, count: number): readonly number[] {
  if (peak <= 0) return [0];
  const rawStep = peak / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value <= peak + step * 0.001; value += step) ticks.push(value);
  return ticks;
}

export function UsageProviderChart({ days, daily, metric }: UsageProviderChartProps) {
  const byDay = useMemo(() => new Map(daily.map((entry) => [entry.day, entry])), [daily]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);

  const { paths, ticks, scaleMax, stepX } = useMemo(() => {
    if (days.length === 0) {
      return { paths: [], ticks: [0] as readonly number[], scaleMax: 0, stepX: 0 };
    }

    const stacked = days.map((day) => {
      const entry = byDay.get(day);
      let running = 0;
      return PROVIDER_ORDER.map((provider) => {
        const base = running;
        running += valueFor(entry, provider, metric);
        return { base, top: running };
      });
    });

    const peak = stacked.reduce(
      (max, columns) => Math.max(max, columns[columns.length - 1]?.top ?? 0),
      0,
    );
    const tickValues = niceTicks(peak, TICK_COUNT);
    const max = tickValues[tickValues.length - 1] ?? 0;
    const step = days.length === 1 ? 0 : VIEW_WIDTH / (days.length - 1);
    const toY = (value: number) =>
      max === 0 ? VIEW_HEIGHT : VIEW_HEIGHT - (value / max) * VIEW_HEIGHT;

    const built = PROVIDER_ORDER.map((provider, providerIndex) => {
      const top: Point[] = stacked.map((columns, dayIndex) => ({
        x: dayIndex * step,
        y: toY(columns[providerIndex]?.top ?? 0),
      }));
      const bottom: Point[] = stacked
        .map((columns, dayIndex) => ({
          x: dayIndex * step,
          y: toY(columns[providerIndex]?.base ?? 0),
        }))
        .toReversed();

      return {
        provider,
        area: `${smoothSegments(top, "M")} ${smoothSegments(bottom, "L")} Z`,
        line: smoothSegments(top, "M"),
      };
    });

    return { paths: built, ticks: tickValues, scaleMax: max, stepX: step };
  }, [byDay, days, metric]);

  const format = metric === "tokens" ? formatTokens : formatUsd;

  const handleMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const bounds = plotRef.current?.getBoundingClientRect();
      if (bounds === undefined || bounds.width === 0 || days.length === 0) return;
      const fraction = (event.clientX - bounds.left) / bounds.width;
      const index = Math.round(fraction * (days.length - 1));
      setHoverIndex(Math.min(days.length - 1, Math.max(0, index)));
    },
    [days.length],
  );

  const hoveredDay = hoverIndex === null ? undefined : days[hoverIndex];
  const hoveredEntry = hoveredDay === undefined ? undefined : byDay.get(hoveredDay);
  const hoverLeft = days.length <= 1 ? 0 : ((hoverIndex ?? 0) / (days.length - 1)) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        {/* Axis labels sit outside the plot so they stay aligned to gridlines. */}
        <div className="relative h-56 w-14 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ top: `${scaleMax === 0 ? 100 : (1 - tick / scaleMax) * 100}%` }}
            >
              {tick === 0 ? "0" : format(tick)}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          className="relative h-56 flex-1"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Daily ${metric === "tokens" ? "processed tokens" : "cost"} by provider`}
          >
            {ticks.map((tick) => {
              const y =
                scaleMax === 0 ? VIEW_HEIGHT : VIEW_HEIGHT - (tick / scaleMax) * VIEW_HEIGHT;
              return (
                <line
                  key={tick}
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

            {paths.map(({ provider, area, line }) => (
              <g key={provider}>
                <path d={area} fill={PROVIDER_COLOR[provider]} fillOpacity={0.5} />
                <path
                  d={line}
                  fill="none"
                  stroke={PROVIDER_COLOR[provider]}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}

            {hoverIndex === null ? null : (
              <line
                x1={hoverIndex * stepX}
                x2={hoverIndex * stepX}
                y1={0}
                y2={VIEW_HEIGHT}
                stroke="currentColor"
                strokeWidth={1}
                className="text-muted-foreground"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {hoveredDay === undefined ? null : (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-36 border border-border bg-background/95 px-2 py-1.5 text-xs"
              style={{
                left: `${hoverLeft}%`,
                transform: hoverLeft > 60 ? "translateX(-100%)" : "translateX(0)",
              }}
            >
              <div className="mb-1 text-muted-foreground">{formatDayShort(hoveredDay)}</div>
              {PROVIDER_ORDER.map((provider) => (
                <div key={provider} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: PROVIDER_COLOR[provider] }}
                    />
                    {PROVIDER_LABEL[provider]}
                  </span>
                  <span className="text-foreground tabular-nums">
                    {format(valueFor(hoveredEntry, provider, metric))}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1">
                <span className="text-muted-foreground">Total</span>
                <span className="text-foreground tabular-nums">
                  {format(
                    metric === "tokens"
                      ? (hoveredEntry?.totalTokens ?? 0)
                      : (hoveredEntry?.costUsd ?? 0),
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pl-16 text-[10px] text-muted-foreground uppercase">
        <span>{days[0] === undefined ? "" : formatDayShort(days[0])}</span>
        <span>
          {days[Math.floor(days.length / 2)] === undefined
            ? ""
            : formatDayShort(days[Math.floor(days.length / 2)] ?? "")}
        </span>
        <span>
          {days[days.length - 1] === undefined ? "" : formatDayShort(days[days.length - 1] ?? "")}
        </span>
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
