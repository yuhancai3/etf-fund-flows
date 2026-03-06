"use client";

import { useState } from "react";
import { ETFSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/data";

interface FlowsSummaryProps {
  summary: ETFSummary;
  aum: number | null;
}

function FlowRow({ label, value, showPercent, aum }: { label: string; value: number; showPercent: boolean; aum: number | null }) {
  const isPositive = value >= 0;
  const display = showPercent && aum
    ? `${isPositive ? "+" : ""}${((value / aum) * 100).toFixed(2)}%`
    : `${isPositive ? "+" : ""}${formatCurrency(value, true)}`;

  return (
    <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a] last:border-b-0">
      <span className="text-[#888888] text-sm font-mono">{label}</span>
      <span
        className={`text-sm font-mono font-bold ${isPositive ? "text-[#00c853]" : "text-[#ff1744]"}`}
      >
        {display}
      </span>
    </div>
  );
}

export default function FlowsSummary({ summary, aum }: FlowsSummaryProps) {
  const [showPercent, setShowPercent] = useState(false);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00]">
          Fund Flows Summary
        </h3>
        {aum && (
          <div className="flex gap-1">
            <button
              onClick={() => setShowPercent(false)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                !showPercent
                  ? "bg-[#ffab00] text-[#0a0a0a] font-bold"
                  : "bg-[#2a2a2a] text-[#888888] hover:text-[#e5e5e5]"
              }`}
            >
              $
            </button>
            <button
              onClick={() => setShowPercent(true)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                showPercent
                  ? "bg-[#ffab00] text-[#0a0a0a] font-bold"
                  : "bg-[#2a2a2a] text-[#888888] hover:text-[#e5e5e5]"
              }`}
            >
              %AUM
            </button>
          </div>
        )}
      </div>
      <FlowRow label="Today" value={summary.daily} showPercent={showPercent} aum={aum} />
      <FlowRow label="1 Week" value={summary.weekly} showPercent={showPercent} aum={aum} />
      <FlowRow label="1 Month" value={summary.monthly} showPercent={showPercent} aum={aum} />
      <FlowRow label="3 Months" value={summary.three_month} showPercent={showPercent} aum={aum} />
      <FlowRow label="6 Months" value={summary.six_month} showPercent={showPercent} aum={aum} />
    </div>
  );
}
