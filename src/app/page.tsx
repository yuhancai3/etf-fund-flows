"use client";

import { useEffect, useState } from "react";
import { ETFData } from "@/lib/types";
import { loadETFData, getAvailableETFs } from "@/lib/data";
import StatsBar from "@/components/StatsBar";
import FlowsSummary from "@/components/FlowsSummary";
import FlowsChart from "@/components/FlowsChart";
import PriceChart from "@/components/PriceChart";
import TopHoldings from "@/components/TopHoldings";
import SectorAllocation from "@/components/SectorAllocation";
import ETFSelector from "@/components/ETFSelector";

export default function Home() {
  const [data, setData] = useState<ETFData | null>(null);
  const [ticker, setTicker] = useState("EWY");
  const [tickers, setTickers] = useState<string[]>(["EWY"]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAvailableETFs().then(setTickers);
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    loadETFData(ticker)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [ticker]);

  if (error)
    return (
      <main className="p-6">
        <p className="text-[#ff1744] font-mono">Error: {error}</p>
      </main>
    );

  if (!data)
    return (
      <main className="p-6">
        <p className="text-[#888888] font-mono">Loading...</p>
      </main>
    );

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-mono font-bold text-[#ffab00]">
            ETF FUND FLOWS
          </h1>
          <p className="text-[#888888] text-sm font-mono mt-1">
            {data.name} ({data.ticker})
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ETFSelector
            tickers={tickers}
            selected={ticker}
            onChange={setTicker}
          />
          <div className="text-right text-xs text-[#888888] font-mono">
            <div>Last updated</div>
            <div>{data.last_updated}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatsBar metadata={data.metadata} />

      {/* Flows Chart */}
      <FlowsChart flows={data.flows} />

      {/* Price Chart */}
      <PriceChart flows={data.flows} />

      {/* Bottom grid: Summary + Holdings + Sectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FlowsSummary summary={data.summary} />
        <TopHoldings holdings={data.holdings} />
        <SectorAllocation sectors={data.sectors} />
      </div>
    </main>
  );
}
