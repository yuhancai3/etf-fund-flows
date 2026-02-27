"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface SectorAllocationProps {
  sectors: Record<string, number>;
}

const SECTOR_COLORS = [
  "#ffab00",
  "#00c853",
  "#ff1744",
  "#2979ff",
  "#aa00ff",
  "#00e5ff",
  "#ff6d00",
  "#76ff03",
  "#f50057",
  "#651fff",
  "#00b8d4",
];

function formatSectorName(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function SectorAllocation({ sectors }: SectorAllocationProps) {
  if (!sectors || Object.keys(sectors).length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
          Sector Allocation
        </h3>
        <p className="text-[#888888] text-sm font-mono">No data available</p>
      </div>
    );
  }

  const data = Object.entries(sectors)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: formatSectorName(key),
      value: parseFloat(value.toFixed(2)),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded p-4">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#ffab00] mb-3">
        Sector Allocation
      </h3>

      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            dataKey="value"
            stroke="#0a0a0a"
            strokeWidth={2}
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
            formatter={(value?: number) => [`${value ?? 0}%`, "Weight"]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-2 space-y-1">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    SECTOR_COLORS[index % SECTOR_COLORS.length],
                }}
              />
              <span className="text-[#888888] truncate">{entry.name}</span>
            </div>
            <span className="text-[#e5e5e5] ml-2 shrink-0">{entry.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
