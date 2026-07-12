import { useState, useMemo, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts'

const TOKEN_COLORS = [
  '#18c5c0', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981',
  '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

const STABLECOIN_SYMBOLS = new Set([
  'USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USDP', 'GUSD', 'LUSD',
])

const formatCompact = (v) => {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}

function TokenIcon({ symbol, size }) {
  const initial = (symbol || '?').charAt(0)
  const colorIndex = symbol ? symbol.charCodeAt(0) % TOKEN_COLORS.length : 0
  const s = size === 'sm' ? 28 : 36
  const r = size === 'sm' ? 8 : 10
  return (
    <span
      className="holdings-token-icon"
      style={{ width: s, height: s, borderRadius: r, background: TOKEN_COLORS[colorIndex], fontSize: size === 'sm' ? 9 : 12 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

function AllocationBar({ percent, highlight }) {
  return (
    <div className={`holdings-bar-track${highlight ? ' holdings-bar-track--highlight' : ''}`} aria-hidden="true">
      <div className="holdings-bar-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  )
}

function PerformanceBadge({ value, label }) {
  const isPositive = value >= 0
  return (
    <span className={`holdings-perf-badge ${isPositive ? 'holdings-perf-badge--up' : 'holdings-perf-badge--down'}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {isPositive ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
      {isPositive ? '+' : ''}{value.toFixed(1)}%
      {label && <small>{label}</small>}
    </span>
  )
}

function InsightCard({ icon, value, label, tone }) {
  return (
    <div className={`holdings-insight-card${tone ? ` holdings-insight-card--${tone}` : ''}`}>
      <div className="holdings-insight-icon">{icon}</div>
      <strong className="holdings-insight-value">{value}</strong>
      <span className="holdings-insight-label">{label}</span>
    </div>
  )
}

function CountUp({ value }) {
  const display = typeof value === 'number'
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value
  return <>{display}</>
}

function SkeletonRows() {
  return (
    <div className="holdings-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div className="holdings-skeleton-row" key={i}>
          <span className="holdings-skeleton-icon" />
          <div className="holdings-skeleton-lines">
            <span className="holdings-skeleton-line holdings-skeleton-line--short" />
            <span className="holdings-skeleton-line holdings-skeleton-line--long" />
          </div>
          <div className="holdings-skeleton-values">
            <span className="holdings-skeleton-line holdings-skeleton-line--medium" />
            <span className="holdings-skeleton-line holdings-skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="holdings-empty">
      <div className="holdings-empty-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
          <path d="M12 18V6" />
        </svg>
      </div>
      <strong>No assets found</strong>
      <span>No priced assets were discovered for this wallet in the selected period.</span>
    </div>
  )
}

function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 7}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.18))', transition: 'd .18s ease' }}
    />
  )
}

export function PortfolioHoldings({ holdings, valuationHistory, periodLabel, isLoading, displayMode, ethPrice }) {
  const [hoveredSymbol, setHoveredSymbol] = useState(null)
  const [hoveredLegend, setHoveredLegend] = useState(null)
  const [showAllTokens, setShowAllTokens] = useState(false)

  const activeSymbol = hoveredSymbol || hoveredLegend

  const performance = useMemo(() => {
    if (!valuationHistory || valuationHistory.length < 2) return null
    const first = valuationHistory[0]?.value
    const last = valuationHistory[valuationHistory.length - 1]?.value
    if (!first || !last || first === 0) return null
    return ((last - first) / Math.abs(first)) * 100
  }, [valuationHistory])

  const sorted = useMemo(() => {
    if (!holdings || holdings.length === 0) return []
    return [...holdings].sort((a, b) => (b.rawUsdValue || 0) - (a.rawUsdValue || 0))
  }, [holdings])

  const pricedHoldings = useMemo(() => sorted.filter((a) => a.priceAvailable), [sorted])
  const unpricedHoldings = useMemo(() => sorted.filter((a) => !a.priceAvailable), [sorted])

  const totalRaw = useMemo(() => {
    return pricedHoldings.reduce((sum, a) => sum + (a.rawUsdValue || 0), 0)
  }, [pricedHoldings])

  const formatValue = useCallback((v) => {
    if (displayMode === 'tokens' && ethPrice) {
      const ethVal = v / ethPrice
      if (ethVal >= 1000) return `${(ethVal / 1000).toFixed(2)}K ETH`
      return `${ethVal.toFixed(4)} ETH`
    }
    return formatCompact(v)
  }, [displayMode, ethPrice])

  const donutData = useMemo(() => {
    return pricedHoldings.slice(0, 8).map((h, i) => ({
      name: h.symbol,
      rawValue: h.rawUsdValue || 0,
      fill: TOKEN_COLORS[i % TOKEN_COLORS.length],
      percent: h.percentage,
    }))
  }, [pricedHoldings])

  const insights = useMemo(() => {
    if (pricedHoldings.length === 0) return null
    const largest = pricedHoldings[0]
    const largestPct = largest.percentage || 0
    const stablecoinPct = pricedHoldings
      .filter((a) => STABLECOIN_SYMBOLS.has(a.symbol))
      .reduce((sum, a) => sum + (a.percentage || 0), 0)
    let diversification
    let diversificationTone
    if (pricedHoldings.length <= 2 || largestPct > 50) {
      diversification = 'Low'
      diversificationTone = 'red'
    } else if (largestPct > 25) {
      diversification = 'Moderate'
      diversificationTone = 'amber'
    } else {
      diversification = 'High'
      diversificationTone = 'green'
    }
    return { largest, largestPct, stablecoinPct, count: pricedHoldings.length, totalCount: sorted.length, diversification, diversificationTone }
  }, [pricedHoldings, sorted.length])

  const handleSymbolHover = useCallback((symbol) => {
    setHoveredSymbol(symbol)
  }, [])

  const handleSymbolLeave = useCallback(() => {
    setHoveredSymbol(null)
  }, [])

  const centerData = useMemo(() => {
    if (activeSymbol && donutData.length > 0) {
      const match = donutData.find((d) => d.name === activeSymbol)
      if (match) return { value: formatValue(match.rawValue), label: match.name }
    }
    return { value: formatValue(totalRaw), label: 'Total Value' }
  }, [activeSymbol, donutData, totalRaw, formatValue])

  if (isLoading) {
    return (
      <section className="card holdings-card">
        <div className="holdings-top">
          <div className="holdings-top-left">
            <h2>Portfolio</h2>
          </div>
        </div>
        <div className="holdings-total-skeleton" />
        <div className="holdings-insights-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="holdings-skeleton-insight" key={i}>
              <span className="holdings-skeleton-line holdings-skeleton-line--icon" />
              <span className="holdings-skeleton-line holdings-skeleton-line--insight-value" />
              <span className="holdings-skeleton-line holdings-skeleton-line--insight-label" />
            </div>
          ))}
        </div>
        <SkeletonRows />
      </section>
    )
  }

  if (sorted.length === 0) {
    return (
      <section className="card holdings-card">
        <div className="holdings-top">
          <div className="holdings-top-left">
            <h2>Portfolio</h2>
          </div>
        </div>
        <EmptyState />
      </section>
    )
  }

  return (
    <section className="card holdings-card">
      <div className="holdings-top">
        <div className="holdings-top-left">
          <h2>Portfolio</h2>
          {performance !== null && (
            <PerformanceBadge value={performance} label={periodLabel} />
          )}
        </div>
        <div className="holdings-top-right">
          <span className="holdings-count-badge">{sorted.length} assets</span>
        </div>
      </div>

      <div className="holdings-total">
        <strong>{formatValue(totalRaw)}</strong>
        {unpricedHoldings.length > 0 && (
          <span className="holdings-total-sub">{pricedHoldings.length} priced · {unpricedHoldings.length} unpriced</span>
        )}
      </div>

      {insights && (
        <div className="holdings-insights">
          <InsightCard
            icon={<TokenIcon symbol={insights.largest.symbol} size="sm" />}
            value={`${insights.largestPct}%`}
            label={`${insights.largest.symbol} · Largest Holding`}
          />
          <InsightCard
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }
            value={<CountUp value={insights.totalCount} />}
            label="Total Assets"
          />
          <InsightCard
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
            value={`${insights.stablecoinPct}%`}
            label="Stablecoin Exposure"
          />
          <InsightCard
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            }
            value={insights.diversification}
            label={`Diversification${insights.largestPct > 0 ? ` · ${insights.largestPct}% top holding` : ''}`}
            tone={insights.diversificationTone}
          />
        </div>
      )}

      <div className="holdings-body">
        <div className="holdings-donut-section">
          <div className="holdings-donut-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {donutData.length > 0 ? (
                  <Pie
                    data={donutData}
                    dataKey="rawValue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={84}
                    activeIndex={activeSymbol ? donutData.findIndex((d) => d.name === activeSymbol) : undefined}
                    activeShape={renderActiveShape}
                    strokeWidth={0}
                    onMouseEnter={(_, index) => setHoveredSymbol(donutData[index]?.name)}
                    onMouseLeave={handleSymbolLeave}
                    animationBegin={0}
                    animationDuration={600}
                    animationEasing="ease-out"
                  >
                    {donutData.map((entry, i) => (
                      <Cell
                        key={`cell-${i}`}
                        fill={entry.fill}
                        style={{
                          filter: activeSymbol && activeSymbol !== entry.name ? 'saturate(0.4) opacity(0.6)' : 'none',
                          transition: 'filter .25s ease, opacity .25s ease',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </Pie>
                ) : (
                  <Pie
                    data={[{ name: 'No Data', rawValue: 1 }]}
                    dataKey="rawValue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={84}
                    strokeWidth={0}
                    fill="var(--line)"
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
            <div className="holdings-donut-center">
              <strong>{centerData.value}</strong>
              <span>{centerData.label}</span>
            </div>
          </div>
          <div className="holdings-legend">
            {donutData.map((entry) => (
              <div
                className={`holdings-legend-item${activeSymbol === entry.name ? ' holdings-legend-item--active' : ''}`}
                key={entry.name}
                onMouseEnter={() => setHoveredLegend(entry.name)}
                onMouseLeave={() => setHoveredLegend(null)}
              >
                <span className="holdings-legend-dot" style={{ background: entry.fill }} />
                <span className="holdings-legend-name">{entry.name}</span>
                <span className="holdings-legend-pct">{entry.percent}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="holdings-list-section">
          <div className="holdings-list-header">
            <span>Asset</span>
            <span>Balance</span>
            <span>{displayMode === 'tokens' ? 'Value (ETH)' : 'Value'}</span>
            <span>Allocation</span>
          </div>
          <div className="holdings-list">
            {pricedHoldings.map((asset) => {
              const isHighlighted = activeSymbol === asset.symbol
              return (
                <div
                  className={`holdings-row${isHighlighted ? ' holdings-row--highlight' : ''}`}
                  key={`${asset.contractAddress || 'eth'}-${asset.symbol}`}
                  onMouseEnter={() => handleSymbolHover(asset.symbol)}
                  onMouseLeave={handleSymbolLeave}
                >
                  <div className="holdings-row-asset">
                    <TokenIcon symbol={asset.symbol} />
                    <div className="holdings-row-asset-info">
                      <strong>{asset.symbol}</strong>
                      <span className="holdings-row-name">{asset.name}</span>
                    </div>
                  </div>
                  <span className="holdings-row-balance">{asset.balance}</span>
                  <strong className="holdings-row-value">
                    {displayMode === 'tokens' && ethPrice ? `${((asset.rawUsdValue || 0) / ethPrice).toFixed(4)} ETH` : asset.usdValue}
                  </strong>
                  <div className="holdings-row-allocation">
                    <AllocationBar percent={asset.percentage} highlight={isHighlighted} />
                    <span className="holdings-row-pct">{asset.percentage}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {unpricedHoldings.length > 0 && (
            <div className="holdings-other">
              <button
                className="holdings-other-toggle"
                onClick={() => setShowAllTokens(!showAllTokens)}
              >
                <span>{showAllTokens ? 'Hide' : 'Show'} {unpricedHoldings.length} other token{unpricedHoldings.length > 1 ? 's' : ''}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showAllTokens ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showAllTokens && (
                <div className="holdings-list">
                  {unpricedHoldings.map((asset) => (
                    <div
                      className="holdings-row holdings-row--unpriced"
                      key={`${asset.contractAddress || 'unk'}-${asset.symbol}`}
                    >
                      <div className="holdings-row-asset">
                        <TokenIcon symbol={asset.symbol} />
                        <div className="holdings-row-asset-info">
                          <strong>{asset.symbol}</strong>
                          <span className="holdings-row-name">{asset.name || 'Unknown Token'}</span>
                        </div>
                      </div>
                      <span className="holdings-row-balance holdings-row-balance--raw">{asset.displayBalance || asset.balance}</span>
                      <strong className="holdings-row-value holdings-row-value--unpriced">—</strong>
                      <div className="holdings-row-allocation">
                        <AllocationBar percent={0} />
                        <span className="holdings-row-pct">—</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
