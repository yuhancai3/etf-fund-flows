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

function computeCorrelation(data: ETFFlow[]): number | null {
  if (data.length < 10) return null;
  // 30-day rolling correlation between daily price change and daily flow
  const window = data.slice(-30);
  const priceChanges: number[] = [];
  const flowValues: number[] = [];
  for (let i = 1; i < window.length; i++) {
    priceChanges.push(window[i].close - window[i - 1].close);
    flowValues.push(window[i].daily_flow);
  }
  const n = priceChanges.length;
  if (n < 5) return null;
  const meanP = priceChanges.reduce((a, b) => a + b, 0) / n;
  const meanF = flowValues.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varP = 0, varF = 0;
  for (let i = 0; i < n; i++) {
    const dp = priceChanges[i] - meanP;
    const df = flowValues[i] - meanF;
    cov += dp * df;
    varP += dp * dp;
    varF += df * df;
  }
  if (varP === 0 || varF === 0) return null;
  return cov / Math.sqrt(varP * varF);
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

  const correlation = useMemo(() => computeCorrelation(data), [data]);

  const divergenceSignal = useMemo(() => {
    if (correlation === null) return null;
    if (correlation < -0.3) return { label: "DIVERGING", color: "text-[#ff1744]", bg: "bg-[#ff1744]/10 border-[#ff1744]/30" };
    if (correlation > 0.3) return { label: "ALIGNED", color: "text-[#00c853]", bg: "bg-[#00c853]/10 border-[#00c853]/30" };
    return { label: "NEUTRAL", color: "text-[#888]", bg: "bg-[#888]/10 border-[#888]/30" };
  }, [correlation]);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00]">
          Price vs Flows ({timeRange})
        </h3>
        {correlation !== null && divergenceSignal && (
          <div className="flex items-center gap-3">
            <div className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${divergenceSignal.bg} ${divergenceSignal.color}`}>
              {divergenceSignal.label}
            </div>
            <span className="text-[10px] font-mono text-[#555]">
              30d corr: {correlation.toFixed(2)}
            </span>
          </div>
        )}
      </div>

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
