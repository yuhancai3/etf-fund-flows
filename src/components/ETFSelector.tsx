interface ETFSelectorProps {
  tickers: string[];
  selected: string;
  onChange: (ticker: string) => void;
}

export default function ETFSelector({
  tickers,
  selected,
  onChange,
}: ETFSelectorProps) {
  if (tickers.length <= 1) return null;

  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#2a2a2a] text-[#e5e5e5] border border-[#3a3a3a] rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-[#ffab00]"
    >
      {tickers.map((ticker) => (
        <option key={ticker} value={ticker}>
          {ticker}
        </option>
      ))}
    </select>
  );
}
