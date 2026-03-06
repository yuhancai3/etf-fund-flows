"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceDot,
} from "recharts";
import { ETFFlow } from "@/lib/types";
import { formatCurrency } from "@/lib/data";

export type TimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";
type FlowType = "daily" | "weekly" | "monthly" | "three_month" | "six_month";

interface FlowsChartProps {
  flows: ETFFlow[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  aum: number | null;
}

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "6M", value: "6M" },
  { label: "1Y", value: "1Y" },
  { label: "ALL", value: "ALL" },
];

const FLOW_TYPES: { label: string; value: FlowType; field: keyof ETFFlow }[] = [
  { label: "Daily", value: "daily", field: "daily_flow" },
  { label: "Weekly", value: "weekly", field: "daily_flow" },
  { label: "Monthly", value: "monthly", field: "daily_flow" },
  { label: "3M Rolling", value: "three_month", field: "three_month_flow" },
  { label: "6M Rolling", value: "six_month", field: "six_month_flow" },
];

function getDateCutoff(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case "1M":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "3M":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "6M":
      return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case "1Y":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case "ALL":
      return null;
  }
}

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay()) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

interface AggregatedPoint {
  date: string;
  flow: number;
  cumulative_flow: number;
  zScore?: number;
}

function aggregateWeekly(data: { date: string; daily_flow: number }[]): AggregatedPoint[] {
  const groups = new Map<string, { dates: string[]; sum: number }>();
  for (const d of data) {
    const week = getISOWeek(new Date(d.date));
    const existing = groups.get(week);
    if (existing) {
      existing.dates.push(d.date);
      existing.sum += d.daily_flow;
    } else {
      groups.set(week, { dates: [d.date], sum: d.daily_flow });
    }
  }
  let cumulative = 0;
  return Array.from(groups.values()).map((g) => {
    cumulative += g.sum;
    return {
      date: g.dates[g.dates.length - 1],
      flow: g.sum,
      cumulative_flow: cumulative,
    };
  });
}

function aggregateMonthly(data: { date: string; daily_flow: number }[]): AggregatedPoint[] {
  const groups = new Map<string, { dates: string[]; sum: number }>();
  for (const d of data) {
    const month = d.date.slice(0, 7); // YYYY-MM
    const existing = groups.get(month);
    if (existing) {
      existing.dates.push(d.date);
      existing.sum += d.daily_flow;
    } else {
      groups.set(month, { dates: [d.date], sum: d.daily_flow });
    }
  }
  let cumulative = 0;
  return Array.from(groups.values()).map((g) => {
    cumulative += g.sum;
    return {
      date: g.dates[g.dates.length - 1],
      flow: g.sum,
      cumulative_flow: cumulative,
    };
  });
}

function computeZScores(data: AggregatedPoint[]): AggregatedPoint[] {
  return data.map((point, i) => {
    if (i < 30) return point;
    const window = data.slice(i - 30, i).map((d) => d.flow);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const stdDev = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length);
    if (stdDev === 0) return point;
    return { ...point, zScore: (point.flow - mean) / stdDev };
  });
}

export default function FlowsChart({ flows, timeRange, onTimeRangeChange, aum }: FlowsChartProps) {
  const [flowType, setFlowType] = useState<FlowType>("daily");

  const flowConfig = FLOW_TYPES.find((f) => f.value === flowType)!;
  const flowLabel = flowConfig.label + " Flow";

  const chartData = useMemo(() => {
    // 1. Filter by time range
    const cutoff = getDateCutoff(timeRange);
    const sliced = cutoff ? flows.filter((f) => new Date(f.date) >= cutoff) : flows;
    if (sliced.length === 0) return [];

    // 2. For rolling types, use the pre-computed field directly
    if (flowType === "three_month" || flowType === "six_month") {
      const field = flowConfig.field;
      const baselineCumulative = sliced[0].cumulative_flow;
      const result: AggregatedPoint[] = sliced.map((f) => ({
        date: f.date,
        flow: f[field] as number,
        cumulative_flow: f.cumulative_flow - baselineCumulative,
      }));
      return computeZScores(result);
    }

    // 3. For daily/weekly/monthly, aggregate from daily_flow
    const dailyData = sliced.map((f) => ({ date: f.date, daily_flow: f.daily_flow }));

    let aggregated: AggregatedPoint[];
    if (flowType === "weekly") {
      aggregated = aggregateWeekly(dailyData);
    } else if (flowType === "monthly") {
      aggregated = aggregateMonthly(dailyData);
    } else {
      // daily
      let cumulative = 0;
      aggregated = dailyData.map((d) => {
        cumulative += d.daily_flow;
        return {
          date: d.date,
          flow: d.daily_flow,
          cumulative_flow: cumulative,
        };
      });
    }

    return computeZScores(aggregated);
  }, [flows, timeRange, flowType, flowConfig.field]);

  // Find unusual activity points for diamond markers
  const unusualPoints = useMemo(() => {
    if (flowType !== "daily") return [];
    return chartData.filter((d) => d.zScore !== undefined && Math.abs(d.zScore) > 2);
  }, [chartData, flowType]);

  const formatXAxis = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatYAxis = (value: number) => formatCurrency(value, true);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00]">
            Fund Flows
          </h3>
          <div className="relative group">
            <span className="text-[#555] hover:text-[#888] cursor-help text-xs">&#9432;</span>
            <div className="absolute left-0 top-5 z-50 hidden group-hover:block w-72 p-3 bg-[#222] border border-[#333] rounded shadow-lg text-[11px] font-mono text-[#aaa] leading-relaxed">
              <p className="text-[#ccc] font-bold mb-1">Methodology</p>
              <p>Daily Flow = (Shares Today - Shares Yesterday) x NAV</p>
              <p className="mt-1">Shares outstanding sourced daily from iShares.com (BlackRock). Days with no iShares data are skipped — no interpolation.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {/* Flow type toggles */}
          <div>
            <div className="text-[10px] font-mono text-[#555] uppercase tracking-wider mb-1">View</div>
            <div className="flex gap-1">
              {FLOW_TYPES.map((ft) => (
                <button
                  key={ft.value}
                  onClick={() => setFlowType(ft.value)}
                  className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                    flowType === ft.value
                      ? "bg-[#ffab00] text-[#0a0a0a] font-bold"
                      : "bg-[#2a2a2a] text-[#888888] hover:text-[#e5e5e5]"
                  }`}
                >
                  {ft.label}
                </button>
              ))}
            </div>
          </div>
          {/* Divider */}
          <div className="hidden sm:block w-px h-8 bg-[#2a2a2a]" />
          {/* Time range toggles */}
          <div>
            <div className="text-[10px] font-mono text-[#555] uppercase tracking-wider mb-1">Range</div>
            <div className="flex gap-1">
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.value}
                  onClick={() => onTimeRangeChange(tr.value)}
                  className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                    timeRange === tr.value
                      ? "bg-[#ffab00] text-[#0a0a0a] font-bold"
                      : "bg-[#2a2a2a] text-[#888888] hover:text-[#e5e5e5]"
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart key={`${timeRange}-${flowType}`} data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="#888888"
            tick={{ fontSize: 11, fontFamily: "monospace" }}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="flow"
            tickFormatter={formatYAxis}
            stroke="#888888"
            tick={{ fontSize: 11, fontFamily: "monospace" }}
            width={70}
          />
          <YAxis
            yAxisId="cumulative"
            orientation="right"
            tickFormatter={formatYAxis}
            stroke="#888888"
            tick={{ fontSize: 11, fontFamily: "monospace" }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#888888" }}
            itemStyle={{ color: "#e0e0e0" }}
            formatter={(value?: number, name?: string) => {
              const v = value ?? 0;
              const dollar = formatCurrency(v, true);
              if (name === "cumulative_flow") return [dollar, "Cumulative"];
              const pctAum = aum ? ` (${((v / aum) * 100).toFixed(2)}% AUM)` : "";
              return [`${dollar}${pctAum}`, flowLabel];
            }}
            labelFormatter={(label) => {
              const d = new Date(String(label));
              return d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
            }}
          />
          <Bar
            yAxisId="flow"
            dataKey="flow"
            name="flow"
            barSize={chartData.length > 200 ? 2 : chartData.length > 60 ? 4 : chartData.length > 20 ? 8 : 16}
          >
            {chartData.map((entry, index) => {
              const isUnusual = entry.zScore !== undefined && Math.abs(entry.zScore) > 2;
              return (
                <Cell
                  key={index}
                  fill={entry.flow >= 0 ? "#00c853" : "#ff1744"}
                  stroke={isUnusual ? "#ffffff" : "none"}
                  strokeWidth={isUnusual ? 2 : 0}
                />
              );
            })}
          </Bar>
          <Line
            yAxisId="cumulative"
            type="monotone"
            dataKey="cumulative_flow"
            stroke="#ffab00"
            dot={false}
            strokeWidth={2}
            name="cumulative_flow"
          />
          {/* Diamond markers for unusual activity */}
          {unusualPoints.map((point) => (
            <ReferenceDot
              key={point.date}
              x={point.date}
              y={point.flow}
              yAxisId="flow"
              r={4}
              fill="#ffffff"
              stroke={point.flow >= 0 ? "#00c853" : "#ff1744"}
              strokeWidth={2}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
