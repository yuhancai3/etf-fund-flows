"use client";

import { useEffect, useState } from "react";
import { ETFData } from "@/lib/types";
import { loadETFData, getAvailableETFs } from "@/lib/data";
import StatsBar from "@/components/StatsBar";
import FlowsSummary from "@/components/FlowsSummary";
import FlowAlerts from "@/components/FlowAlerts";
import FlowsChart, { type TimeRange } from "@/components/FlowsChart";
import PriceChart from "@/components/PriceChart";
import TopHoldings from "@/components/TopHoldings";
import SectorAllocation from "@/components/SectorAllocation";
import ETFSelector from "@/components/ETFSelector";

function FreshnessBadge({ lastUpdated }: { lastUpdated: string }) {
  const updated = new Date(lastUpdated);
  const now = new Date();
  const hoursAgo = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);

  // Data pipeline runs at 5:30 PM ET (21:30 UTC) on weekdays
  const isToday = updated.toDateString() === now.toDateString();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  let label: string;
  let color: string;

  if (isToday || (isWeekend && hoursAgo < 72)) {
    label = "FRESH";
    color = "text-[#00c853]";
  } else if (hoursAgo < 48) {
    label = "1 DAY OLD";
    color = "text-[#ffab00]";
  } else {
    label = "STALE";
    color = "text-[#ff1744]";
  }

  return (
    <span className={`${color} text-[10px] font-bold tracking-wider`}>
      {label}
    </span>
  );
}

export default function Home() {
  const [data, setData] = useState<ETFData | null>(null);
  const [ticker, setTicker] = useState("EWY");
  const [tickers, setTickers] = useState<string[]>(["EWY"]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("6M");

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
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {/* Skeleton header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-48 bg-[#1a1a1a] rounded animate-pulse" />
            <div className="h-4 w-64 bg-[#1a1a1a] rounded animate-pulse mt-2" />
          </div>
          <div className="h-8 w-24 bg-[#1a1a1a] rounded animate-pulse" />
        </div>
        {/* Skeleton stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-4 py-3 h-[72px] animate-pulse" />
          ))}
        </div>
        {/* Skeleton chart */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4 h-[420px] animate-pulse" />
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4 h-[320px] animate-pulse" />
        {/* Skeleton bottom grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4 h-[280px] animate-pulse" />
          ))}
        </div>
      </main>
    );

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
          <div className="text-right text-xs font-mono">
            <div className="text-[#888888]">Last updated</div>
            <div className="text-[#888888]">{data.last_updated}</div>
            <FreshnessBadge lastUpdated={data.last_updated} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatsBar metadata={data.metadata} flows={data.flows} />

      {/* Unusual Activity Alerts */}
      <FlowAlerts flows={data.flows} aum={data.metadata.aum} />

      {/* Flows Chart */}
      <FlowsChart flows={data.flows} timeRange={timeRange} onTimeRangeChange={setTimeRange} aum={data.metadata.aum} />

      {/* Price vs Flows Divergence */}
      <PriceChart flows={data.flows} timeRange={timeRange} />

      {/* Bottom grid: Summary + Holdings + Sectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FlowsSummary summary={data.summary} aum={data.metadata.aum} />
        <TopHoldings holdings={data.holdings} />
        <SectorAllocation sectors={data.sectors} />
      </div>
    </main>
  );
}
