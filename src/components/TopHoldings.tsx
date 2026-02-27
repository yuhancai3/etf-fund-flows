import { Holding } from "@/lib/types";

interface TopHoldingsProps {
  holdings: Holding[];
}

export default function TopHoldings({ holdings }: TopHoldingsProps) {
  if (!holdings || holdings.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
          Top Holdings
        </h3>
        <p className="text-[#888888] text-sm font-mono">No data available</p>
      </div>
    );
  }

  const top10 = holdings.slice(0, 10);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
        Top Holdings
      </h3>
      <div className="space-y-1">
        {top10.map((holding, index) => (
          <div
            key={holding.symbol}
            className="flex items-center justify-between py-1.5 border-b border-[#2a2a2a] last:border-b-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#888888] text-xs font-mono w-5 shrink-0 text-right">
                {index + 1}.
              </span>
              <span className="text-[#e5e5e5] text-sm font-mono truncate">
                {holding.name}
              </span>
            </div>
            <span className="text-[#ffab00] text-sm font-mono font-bold ml-2 shrink-0">
              {holding.weight.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
