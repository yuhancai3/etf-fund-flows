import { ETFMetadata, ETFFlow } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/data";

interface StatsBarProps {
  metadata: ETFMetadata;
  flows: ETFFlow[];
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

export default function StatsBar({ metadata, flows }: StatsBarProps) {
  // Calculate daily price change from last two data points
  const dailyChange = (() => {
    if (flows.length < 2) return null;
    const today = flows[flows.length - 1].close;
    const yesterday = flows[flows.length - 2].close;
    const change = ((today - yesterday) / yesterday) * 100;
    return change;
  })();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="AUM"
        value={metadata.aum ? formatCurrency(metadata.aum, true) : "N/A"}
      />
      <StatCard label="NAV" value={`$${metadata.nav.toFixed(2)}`} />
      {metadata.expense_ratio ? (
        <StatCard
          label="Expense Ratio"
          value={formatPercent(metadata.expense_ratio)}
        />
      ) : (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-4 py-3">
          <div className="text-[#888888] text-xs font-mono uppercase tracking-wider">
            Daily Change
          </div>
          <div className={`text-lg font-mono font-bold mt-1 ${
            dailyChange === null ? "text-[#e5e5e5]" :
            dailyChange >= 0 ? "text-[#00c853]" : "text-[#ff1744]"
          }`}>
            {dailyChange === null ? "N/A" :
              `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)}%`}
          </div>
        </div>
      )}
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
