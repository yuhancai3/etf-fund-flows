"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ETFFlow } from "@/lib/types";
import { formatCurrency } from "@/lib/data";
import { type TimeRange } from "@/components/FlowsChart";

const TIME_RANGE_MONTHS: Record<TimeRange, number | null> = {
  "1M": 1, "3M": 3, "6M": 6, "1Y": 12, ALL: null,
};

interface PriceChartProps {
  flows: ETFFlow[];
  timeRange: TimeRange;
}

export default function PriceChart({ flows, timeRange }: PriceChartProps) {
  const data = useMemo(() => {
    const months = TIME_RANGE_MONTHS[timeRange];
    const filtered = months === null
      ? flows
      : (() => {
          const cutoff = new Date();
          cutoff.setMonth(cutoff.getMonth() - months);
          return flows.filter((f) => new Date(f.date) >= cutoff);
        })();
    if (filtered.length === 0) return [];

    // Rebase cumulative flow to 0 for the visible window
    const baselineCumulative = filtered[0].cumulative_flow;
    return filtered.map((f) => ({
      ...f,
      cumulative_flow: f.cumulative_flow - baselineCumulative,
    }));
  }, [flows, timeRange]);

  const formatXAxis = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const [minPrice, maxPrice] = useMemo(() => {
    if (data.length === 0) return [0, 100];
    const prices = data.map((d) => d.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.05;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [data]);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-4">
        Price vs Flows ({timeRange})
      </h3>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ffab00" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ffab00" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="#888888"
            tick={{ fontSize: 11, fontFamily: "monospace" }}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="price"
            domain={[minPrice, maxPrice]}
            stroke="#888888"
            tick={{ fontSize: 11, fontFamily: "monospace" }}
            tickFormatter={(v: number) => `$${v}`}
            width={60}
          />
          <YAxis
            yAxisId="flow"
            orientation="right"
            stroke="#888888"
            tick={{ fontSize: 11, fontFamily: "monospace" }}
            tickFormatter={(v: number) => formatCurrency(v, true)}
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
              if (name === "close") return [`$${(value ?? 0).toFixed(2)}`, "Price"];
              return [formatCurrency(value ?? 0, true), "Cumulative Flow"];
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
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="close"
            name="close"
            stroke="#ffab00"
            fill="url(#priceGradient)"
            strokeWidth={2}
          />
          <Line
            yAxisId="flow"
            type="monotone"
            dataKey="cumulative_flow"
            name="cumulative_flow"
            stroke="#00c853"
            dot={false}
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-3 text-xs font-mono text-[#888]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#ffab00]" />
          <span>Price</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#00c853]" />
          <span>Cumulative Flow</span>
        </div>
      </div>
    </div>
  );
}
