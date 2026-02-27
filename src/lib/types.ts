export interface ETFFlow {
  date: string;
  close: number;
  shares: number;
  daily_flow: number;
  weekly_flow: number;
  monthly_flow: number;
  three_month_flow: number;
  six_month_flow: number;
  cumulative_flow: number;
}

export interface ETFMetadata {
  aum: number | null;
  nav: number;
  expense_ratio: number | null;
  shares_outstanding: number | null;
  currency: string;
}

export interface ETFSummary {
  daily: number;
  weekly: number;
  monthly: number;
  three_month: number;
  six_month: number;
}

export interface Holding {
  name: string;
  symbol: string;
  weight: number;
}

export interface ETFData {
  ticker: string;
  name: string;
  last_updated: string;
  metadata: ETFMetadata;
  summary: ETFSummary;
  holdings: Holding[];
  sectors: Record<string, number>;
  flows: ETFFlow[];
}
