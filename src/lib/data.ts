import { ETFData } from "./types";

export async function loadETFData(ticker: string): Promise<ETFData> {
  const res = await fetch(`/data/${ticker}.json`);
  if (!res.ok) throw new Error(`Failed to load data for ${ticker}`);
  return res.json();
}

export async function getAvailableETFs(): Promise<string[]> {
  return ["EWY"];
}

export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
