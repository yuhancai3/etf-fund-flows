import { ETFSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/data";

interface FlowsSummaryProps {
  summary: ETFSummary;
}

function FlowRow({ label, value }: { label: string; value: number }) {
  const isPositive = value >= 0;
  return (
    <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a] last:border-b-0">
      <span className="text-[#888888] text-sm font-mono">{label}</span>
      <span
        className={`text-sm font-mono font-bold ${isPositive ? "text-[#00c853]" : "text-[#ff1744]"}`}
      >
        {isPositive ? "+" : ""}
        {formatCurrency(value, true)}
      </span>
    </div>
  );
}

export default function FlowsSummary({ summary }: FlowsSummaryProps) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
        Fund Flows Summary
      </h3>
      <FlowRow label="Today" value={summary.daily} />
      <FlowRow label="1 Week" value={summary.weekly} />
      <FlowRow label="1 Month" value={summary.monthly} />
      <FlowRow label="3 Months" value={summary.three_month} />
      <FlowRow label="6 Months" value={summary.six_month} />
    </div>
  );
}
