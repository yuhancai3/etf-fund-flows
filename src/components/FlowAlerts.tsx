"use client";

import { useMemo } from "react";
import { ETFFlow } from "@/lib/types";
import { formatCurrency } from "@/lib/data";

interface FlowAlertsProps {
  flows: ETFFlow[];
  aum: number | null;
}

interface Alert {
  type: "inflow" | "outflow" | "unusual" | "streak";
  text: string;
  date?: string;
}

export default function FlowAlerts({ flows, aum }: FlowAlertsProps) {
  const alerts = useMemo(() => {
    if (flows.length < 30) return [];

    const recent = flows.slice(-90);
    const result: Alert[] = [];

    // Largest single-day inflow/outflow in last 90 days
    let maxInflow = { value: 0, date: "" };
    let maxOutflow = { value: 0, date: "" };
    for (const f of recent) {
      if (f.daily_flow > maxInflow.value) {
        maxInflow = { value: f.daily_flow, date: f.date };
      }
      if (f.daily_flow < maxOutflow.value) {
        maxOutflow = { value: f.daily_flow, date: f.date };
      }
    }

    // Z-score unusual days (last 90 days, using 30-day rolling window)
    const unusualDays: { date: string; flow: number; zScore: number }[] = [];
    for (let i = 30; i < recent.length; i++) {
      const window = recent.slice(i - 30, i).map((d) => d.daily_flow);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const stdDev = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length);
      if (stdDev === 0) continue;
      const z = (recent[i].daily_flow - mean) / stdDev;
      if (Math.abs(z) > 2) {
        unusualDays.push({ date: recent[i].date, flow: recent[i].daily_flow, zScore: z });
      }
    }

    // Longest consecutive inflow streak
    let currentStreak = 0;
    let maxStreak = 0;
    let streakEnd = "";
    for (const f of recent) {
      if (f.daily_flow > 0) {
        currentStreak++;
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          streakEnd = f.date;
        }
      } else {
        currentStreak = 0;
      }
    }

    // Build alerts
    if (maxInflow.value > 0) {
      const d = new Date(maxInflow.date);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const pct = aum ? ` (${((maxInflow.value / aum) * 100).toFixed(2)}% AUM)` : "";
      result.push({
        type: "inflow",
        text: `Largest inflow: +${formatCurrency(maxInflow.value, true)}${pct} on ${dateStr}`,
        date: maxInflow.date,
      });
    }

    if (unusualDays.length > 0) {
      result.push({
        type: "unusual",
        text: `${unusualDays.length} unusual flow day${unusualDays.length > 1 ? "s" : ""} in last 90 days (>2 sigma)`,
      });
    }

    if (maxStreak >= 3) {
      const d = new Date(streakEnd);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.push({
        type: "streak",
        text: `${maxStreak}-day consecutive inflow streak ending ${dateStr}`,
        date: streakEnd,
      });
    }

    if (maxOutflow.value < 0) {
      const d = new Date(maxOutflow.date);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.push({
        type: "outflow",
        text: `Largest outflow: ${formatCurrency(maxOutflow.value, true)} on ${dateStr}`,
        date: maxOutflow.date,
      });
    }

    return result.slice(0, 3);
  }, [flows, aum]);

  if (alerts.length === 0) return null;

  const colorMap = {
    inflow: "border-[#00c853] text-[#00c853]",
    outflow: "border-[#ff1744] text-[#ff1744]",
    unusual: "border-[#ffab00] text-[#ffab00]",
    streak: "border-[#2979ff] text-[#2979ff]",
  };

  const iconMap = {
    inflow: "\u25B2",  // up triangle
    outflow: "\u25BC", // down triangle
    unusual: "\u26A0", // warning
    streak: "\u2192",  // arrow
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex-1 bg-[#1a1a1a] border rounded px-3 py-2 text-xs font-mono ${colorMap[alert.type]}`}
        >
          <span className="mr-2">{iconMap[alert.type]}</span>
          {alert.text}
        </div>
      ))}
    </div>
  );
}
