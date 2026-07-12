import { useState } from 'react'
import { CircleCheck, ExternalLink, Network } from 'lucide-react'
import { Activity } from './components/dashboard/Activity'
import { BalanceCard } from './components/dashboard/BalanceCard'
import { DashboardBar } from './components/dashboard/DashboardBar'
import { DashboardLoader } from './components/dashboard/DashboardLoader'
import { IdentityCard } from './components/dashboard/IdentityCard'
import { Insights } from './components/dashboard/Insights'
import { MoneyFlowTab } from './components/dashboard/MoneyFlowTab'
import { PortfolioCard } from './components/dashboard/PortfolioCard'
import { PortfolioHoldings } from './components/dashboard/PortfolioHoldings'
import { Summary } from './components/dashboard/Summary'
import { WalletPersonality } from './components/dashboard/WalletPersonality'
import { BottomNav } from './components/layout/BottomNav'
import { Header } from './components/layout/Header'
import { useTheme } from './hooks/useTheme'
import { useWalletDashboard } from './hooks/useWalletDashboard'
import { ANALYSIS_PERIODS, walletService } from './services/walletService'

const exampleWallets = walletService.listExampleWallets()

export default function App() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [displayMode, setDisplayMode] = useState('usd')
  const {
    wallet,
    error,
    searchValue,
    isLoading,
    isPeriodLoading,
    isRefreshing,
    pendingAnalysisDays,
    isResolving,
    analysisDays,
    customRange,
    resolvedIdentifier,
    setSearchValue,
    searchWallet,
    refreshWallet,
    selectExampleWallet,
    selectAnalysisPeriod,
    connectedAddress,
    walletProviders,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
  } = useWalletDashboard()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="app-shell mx-auto w-[min(100%,1180px)] px-[clamp(16px,3vw,32px)] pb-[124px] max-[700px]:px-4 max-[700px]:pb-[120px] max-[480px]:px-3 max-[480px]:pb-[116px] max-[360px]:px-[9px] max-[360px]:pb-28">
      <Header
        wallet={wallet}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={searchWallet}
        searchError={error}
        resolvedIdentifier={resolvedIdentifier}
        onSelectExampleWallet={selectExampleWallet}
        isLoading={isLoading}
        isResolving={isResolving}
        isRefreshing={isRefreshing}
        onRefreshWallet={refreshWallet}
        exampleWallets={exampleWallets}
        theme={theme}
        onToggleTheme={toggleTheme}
        connectedAddress={connectedAddress}
        walletProviders={walletProviders}
        isConnecting={isConnecting}
        connectionError={connectionError}
        onConnectWallet={connectWallet}
        onDisconnectWallet={disconnectWallet}
      />

      {wallet ? (
        <>
          <section className="wallet-context" aria-label="Wallet overview heading">
            <div className="wallet-context__title">
              <span className="wallet-context__icon"><Network aria-hidden="true" /></span>
              <div>
                <span>Ethereum Mainnet</span>
                <h2>Address Overview</h2>
              </div>
            </div>
            <div className="wallet-context__address">
              <CircleCheck aria-hidden="true" />
              <code>{wallet.id}</code>
              <a href={`https://etherscan.io/address/${wallet.id}`} target="_blank" rel="noreferrer" aria-label="View address on Etherscan">
                <ExternalLink aria-hidden="true" />
              </a>
            </div>
          </section>
          <BottomNav active={activeTab} onChange={setActiveTab} />
          {activeTab === 'Overview' ? (
            <main className={`grid gap-9 max-[700px]:gap-6 ${isLoading ? 'dashboard-loading' : 'dashboard-ready'}`} key={wallet.id}>
              {isLoading && <DashboardLoader />}
              <DashboardBar
                periods={ANALYSIS_PERIODS}
                selectedDays={analysisDays}
                customRange={customRange}
                pendingDays={pendingAnalysisDays}
                isLoading={isPeriodLoading}
                onPeriodChange={selectAnalysisPeriod}
                displayMode={displayMode}
                onDisplayModeChange={setDisplayMode}
              />
              <div className="dashboard-grid dashboard-grid--top grid gap-6 min-[900px]:grid-cols-2 min-[1180px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <BalanceCard
                  balance={wallet.balance}
                  error={error}
                  displayMode={displayMode}
                  ethPrice={wallet.ethPrice}
                />
                <PortfolioCard portfolio={wallet.portfolio} />
                <IdentityCard stats={wallet.identity} />
                <WalletPersonality personality={wallet.personality} />
              </div>
              <PortfolioHoldings
                holdings={wallet.holdings}
                valuationHistory={wallet.balance?.history}
                periodLabel={wallet.periodLabel}
                isLoading={isLoading}
                displayMode={displayMode}
                ethPrice={wallet.ethPrice}
              />
              <Summary flow={wallet.flow} />
              <Activity
                walletAddress={wallet.id}
                transactions={wallet.transactions}
                highlights={wallet.highlights}
                periodLabel={wallet.periodLabel}
                reportRange={wallet.reportRange}
              />
              <Insights insights={wallet.insights} />
            </main>
          ) : (
            <main key={`flow-${wallet.id}`} className={isLoading ? 'dashboard-loading' : 'dashboard-ready'}>
              {isLoading && <DashboardLoader />}
              <MoneyFlowTab wallet={wallet} />
            </main>
          )}
        </>
      ) : (
        <main className="wallet-empty-state grid min-h-[58vh] place-content-center justify-items-center gap-3 rounded-[28px] border border-dashed border-[rgba(44,122,123,.2)] bg-white/55 px-6 py-12 text-center dark:border-[var(--border)] dark:bg-[rgba(17,24,39,.55)]">
          {isLoading && <DashboardLoader />}
          <span>Wallet analytics</span>
          <h2>Enter a wallet address or ENS name</h2>
          <p>Search an Ethereum address or .eth name to load its on-chain analytics.</p>
        </main>
      )}
    </div>
  )
}
