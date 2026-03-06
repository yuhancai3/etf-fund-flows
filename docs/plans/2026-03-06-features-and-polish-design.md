# ETF Fund Flows - Features & Polish Design

## Decisions Made
- Flow aggregation: Aggregate Weekly/Monthly, keep 3M/6M as rolling (renamed)
- Divergence chart: Replace PriceChart with dual-axis Price + Cumulative Flows
- Z-Score: Both chart highlights AND alerts panel
- % AUM: Toggle in FlowsSummary + always in tooltip
- UI Polish: Full pass (skeletons, toggle labels, mobile, pie labels)

## Section 1: Flow Chart Aggregation

### Changes to FlowsChart.tsx
- Add `aggregateWeekly(data)`: group by ISO week, sum `daily_flow`, pick last date per group
- Add `aggregateMonthly(data)`: group by YYYY-MM, sum `daily_flow`, pick last date per group
- Recalculate cumulative flow from aggregated sums (running total)
- Rename FLOW_TYPES:
  - "Daily" -> "Daily" (unchanged)
  - "Weekly" -> "Weekly" (now aggregated)
  - "Monthly" -> "Monthly" (now aggregated)
  - "3M Rolling" (was "3M Rolling")
  - "6M Rolling" (was "6M Rolling")
- Bar width auto-adjusts based on data point count
- When flowType is "weekly"/"monthly", apply aggregation AFTER time range filtering

## Section 2: Price + Flows Divergence Chart

### Changes to PriceChart.tsx
- Dual Y-axis: Left = Price (area, amber), Right = Cumulative Flow (line, green)
- Rebase cumulative flow to 0 for visible window
- Title: "Price vs Flows"
- Tooltip shows both price and cumulative flow
- Uses ComposedChart instead of AreaChart
- Needs `cumulative_flow` from ETFFlow data

## Section 3: Z-Score / Unusual Activity

### New: FlowAlerts.tsx component
- Placed between StatsBar and FlowsChart in page.tsx
- Scans last 90 days of flow data
- Computes 30-day rolling mean + stddev of daily_flow
- Alerts (max 3, most recent first):
  - Largest single-day inflow in last 90d
  - Largest single-day outflow in last 90d
  - Any day >2 sigma with count
  - Longest consecutive inflow/outflow streak
- Compact card layout: icon + text + color coding

### Changes to FlowsChart.tsx
- Compute z-scores for daily view
- Bars with |z| > 2 get white border (stroke)
- Small diamond marker above/below unusual bars

## Section 4: Flows as % of AUM

### Changes to FlowsSummary.tsx
- Add toggle state: "dollars" | "percent"
- Two small buttons: "$" and "%"
- When "%", divide flow values by AUM, format as percentage
- Requires AUM passed as prop (from metadata)

### Changes to FlowsChart.tsx tooltip
- Always show "X.XX% of AUM" alongside dollar amount
- Requires AUM passed as prop

## Section 5: UI Polish

### Toggle group clarity (FlowsChart.tsx)
- Add "VIEW" label above flow type buttons
- Add "RANGE" label above time range buttons
- Subtle vertical divider between the two groups

### Loading skeleton (page.tsx)
- New skeleton state when data is null
- Shimmer placeholders: 4 stat cards, 2 chart rectangles, 3 bottom cards
- CSS animation for shimmer effect

### Mobile layout (page.tsx, FlowsChart.tsx)
- Stack header vertically on small screens
- Full-width toggle rows on mobile

### Expense ratio fix (StatsBar.tsx)
- When expense_ratio is null, show "Daily Change" stat instead
- Calculate from last two flow entries (close prices)

### Sector pie labels (SectorAllocation.tsx)
- Add percentage text labels on the 3-4 largest slices

## Implementation Order
1. Section 5 (UI Polish) - foundation improvements
2. Section 1 (Aggregation fix) - fixes the known bug
3. Section 2 (Divergence chart) - replaces PriceChart
4. Section 4 (% AUM) - small addition
5. Section 3 (Z-Score) - most complex, builds on everything else
