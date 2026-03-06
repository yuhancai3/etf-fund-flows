import { ETFMetadata, ETFFlow } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/data";

interface StatsBarProps {
  metadata: ETFMetadata;
  flows: ETFFlow[];
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-4 py-3">
      <div className="text-[#888888] text-xs font-mono uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-lg font-mono font-bold mt-1 ${color || "text-[#e5e5e5]"}`}>
        {value}
      </div>
    </div>
  );
}

export default function StatsBar({ metadata, flows }: StatsBarProps) {
  // Daily price change
  const dailyChange = (() => {
    if (flows.length < 2) return null;
    const today = flows[flows.length - 1].close;
    const yesterday = flows[flows.length - 2].close;
    return ((today - yesterday) / yesterday) * 100;
  })();

  // Flow momentum: this week's flow vs last week's flow
  const flowMomentum = (() => {
    if (flows.length < 10) return null;
    const thisWeek = flows.slice(-5).reduce((sum, f) => sum + f.daily_flow, 0);
    const lastWeek = flows.slice(-10, -5).reduce((sum, f) => sum + f.daily_flow, 0);
    if (lastWeek === 0) return null;
    return { thisWeek, lastWeek, accelerating: thisWeek > lastWeek };
  })();

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard
        label="AUM"
        value={metadata.aum ? formatCurrency(metadata.aum, true) : "N/A"}
      />
      <StatCard label="NAV" value={`$${metadata.nav.toFixed(2)}`} />
      <StatCard
        label="Daily Change"
        value={dailyChange === null ? "N/A" : `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)}%`}
        color={dailyChange === null ? undefined : dailyChange >= 0 ? "text-[#00c853]" : "text-[#ff1744]"}
      />
      <StatCard
        label="Shares Outstanding"
        value={metadata.shares_outstanding ? formatNumber(metadata.shares_outstanding) : "N/A"}
      />
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-4 py-3">
        <div className="text-[#888888] text-xs font-mono uppercase tracking-wider">
          Flow Momentum
        </div>
        {flowMomentum ? (
          <div className="mt-1">
            <div className={`text-lg font-mono font-bold ${
              flowMomentum.accelerating ? "text-[#00c853]" : "text-[#ff1744]"
            }`}>
              {flowMomentum.accelerating ? "\u25B2" : "\u25BC"}{" "}
              {formatCurrency(flowMomentum.thisWeek, true)}
            </div>
            <div className="text-[10px] font-mono text-[#555] mt-0.5">
              vs {formatCurrency(flowMomentum.lastWeek, true)} prev wk
            </div>
          </div>
        ) : (
          <div className="text-lg font-mono font-bold mt-1 text-[#e5e5e5]">N/A</div>
        )}
      </div>
    </div>
  );
}
