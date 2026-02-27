"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ETFFlow } from "@/lib/types";

interface PriceChartProps {
  flows: ETFFlow[];
}

export default function PriceChart({ flows }: PriceChartProps) {
  const data = useMemo(() => {
    // Show last 6 months of data
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return flows.filter((f) => new Date(f.date) >= cutoff);
  }, [flows]);

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
        Price Performance (6M)
      </h3>

      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
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
            domain={[minPrice, maxPrice]}
            stroke="#888888"
            tick={{ fontSize: 11, fontFamily: "monospace" }}
            tickFormatter={(v: number) => `$${v}`}
            width={60}
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
            formatter={(value?: number) => [`$${(value ?? 0).toFixed(2)}`, "Close"]}
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
            type="monotone"
            dataKey="close"
            stroke="#ffab00"
            fill="url(#priceGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
