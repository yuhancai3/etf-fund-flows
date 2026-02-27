import { ETFMetadata } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/data";

interface StatsBarProps {
  metadata: ETFMetadata;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-4 py-3">
      <div className="text-[#888888] text-xs font-mono uppercase tracking-wider">
        {label}
      </div>
      <div className="text-[#e5e5e5] text-lg font-mono font-bold mt-1">
        {value}
      </div>
    </div>
  );
}

export default function StatsBar({ metadata }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="AUM"
        value={metadata.aum ? formatCurrency(metadata.aum, true) : "N/A"}
      />
      <StatCard label="NAV" value={`$${metadata.nav.toFixed(2)}`} />
      <StatCard
        label="Expense Ratio"
        value={
          metadata.expense_ratio
            ? formatPercent(metadata.expense_ratio)
            : "N/A"
        }
      />
      <StatCard
        label="Shares Outstanding"
        value={
          metadata.shares_outstanding
            ? formatNumber(metadata.shares_outstanding)
            : "N/A"
        }
      />
    </div>
  );
}
