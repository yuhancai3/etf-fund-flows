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
} from "recharts";
import { ETFFlow } from "@/lib/types";
import { formatCurrency } from "@/lib/data";

interface FlowsChartProps {
  flows: ETFFlow[];
}

type TimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";
type FlowType = "daily" | "weekly" | "monthly" | "three_month" | "six_month";

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "6M", value: "6M" },
  { label: "1Y", value: "1Y" },
  { label: "ALL", value: "ALL" },
];

const FLOW_TYPES: { label: string; value: FlowType; field: keyof ETFFlow }[] = [
  { label: "Daily", value: "daily", field: "daily_flow" },
  { label: "Weekly", value: "weekly", field: "weekly_flow" },
  { label: "Monthly", value: "monthly", field: "monthly_flow" },
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

export default function FlowsChart({ flows }: FlowsChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("6M");
  const [flowType, setFlowType] = useState<FlowType>("daily");

  const flowField = FLOW_TYPES.find((f) => f.value === flowType)!.field;

  const filteredData = useMemo(() => {
    const cutoff = getDateCutoff(timeRange);
    if (!cutoff) return flows;
    return flows.filter((f) => new Date(f.date) >= cutoff);
  }, [flows, timeRange]);

  const formatXAxis = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatYAxis = (value: number) => formatCurrency(value, true);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00]">
          Fund Flows
        </h3>
        <div className="flex flex-wrap gap-2">
          {/* Flow type toggles */}
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
          {/* Time range toggles */}
          <div className="flex gap-1">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
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

      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={filteredData}>
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
            formatter={(value?: number, name?: string) => [
              formatCurrency(value ?? 0, true),
              name === "cumulative_flow" ? "Cumulative" : "Flow",
            ]}
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
            dataKey={flowField as string}
            name={flowField as string}
            barSize={filteredData.length > 200 ? 2 : filteredData.length > 60 ? 4 : 8}
          >
            {filteredData.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  (entry[flowField] as number) >= 0 ? "#00c853" : "#ff1744"
                }
              />
            ))}
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
