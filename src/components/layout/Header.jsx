import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, CheckCircle2, ChevronDown, Moon, RotateCw, Search, Sun, WalletCards, X } from 'lucide-react'

const compactAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`

export function Header({
  wallet,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchError,
  resolvedIdentifier,
  onSelectExampleWallet,
  isLoading,
  isResolving,
  isRefreshing,
  onRefreshWallet,
  exampleWallets,
  theme,
  onToggleTheme,
  connectedAddress,
  walletProviders,
  isConnecting,
  connectionError,
  onConnectWallet,
  onDisconnectWallet,
}) {
  const searchInputRef = useRef(null)
  const notificationRef = useRef(null)
  const walletControlRef = useRef(null)
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false)
  const [isWalletPanelOpen, setIsWalletPanelOpen] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(() => (
    'Notification' in window ? Notification.permission : 'unsupported'
  ))

  useEffect(() => {
    const handleSearchShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }

      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        onSearchChange('')
        searchInputRef.current.blur()
      }

      if (event.key === 'Escape') {
        setIsNotificationPanelOpen(false)
        setIsWalletPanelOpen(false)
      }
    }

    const handleOutsideClick = (event) => {
      if (!notificationRef.current?.contains(event.target)) {
        setIsNotificationPanelOpen(false)
      }

      if (!walletControlRef.current?.contains(event.target)) {
        setIsWalletPanelOpen(false)
      }
    }

    window.addEventListener('keydown', handleSearchShortcut)
    document.addEventListener('pointerdown', handleOutsideClick)

    return () => {
      window.removeEventListener('keydown', handleSearchShortcut)
      document.removeEventListener('pointerdown', handleOutsideClick)
    }
  }, [onSearchChange])

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return

    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)

      if (permission === 'granted') {
        try {
          new Notification('Notifications enabled', {
            body: 'MyWallet360 can now send browser notifications.',
            icon: '/favicon.svg',
          })
        } catch {
          // Some mobile browsers grant permission but require a service worker to display notifications.
        }
      }
    } catch {
      setNotificationPermission('unsupported')
    }
  }

  const notificationContent = {
    default: {
      title: 'Enable notifications?',
      description: 'Allow MyWallet360 to send browser notifications. You will receive a confirmation after enabling.',
    },
    granted: {
      title: 'Notifications are enabled',
      description: 'MyWallet360 has permission to send browser notifications.',
    },
    denied: {
      title: 'Notifications are blocked',
      description: 'Enable notifications from your browser site settings to receive alerts.',
    },
    unsupported: {
      title: 'Notifications unavailable',
      description: 'This browser does not support desktop notifications.',
    },
  }[notificationPermission]
  const hasMetaMask = walletProviders.some((walletProvider) => (
    walletProvider.provider.isMetaMask || walletProvider.rdns.includes('metamask')
  ))
  const isSearchBusy = isLoading || isResolving

  return (
    <header className="header relative z-[100] my-[18px] mb-[30px] grid min-h-[102px] grid-cols-[minmax(200px,1fr)_minmax(340px,460px)_minmax(290px,1fr)] items-center gap-5 rounded-[20px] border border-white/50 bg-white/75 p-[14px_16px] shadow-[0_8px_32px_rgba(15,23,42,.06)] backdrop-blur-xl max-[1050px]:grid-cols-[minmax(190px,.9fr)_minmax(320px,1.2fr)_auto] max-[1050px]:gap-3 max-[899px]:grid-cols-[minmax(190px,1fr)_auto] max-[700px]:my-3 max-[700px]:mb-6 max-[700px]:min-h-0 max-[700px]:gap-3 max-[700px]:p-3 max-[480px]:grid-cols-[minmax(0,1fr)_auto] max-[480px]:rounded-[18px]">
      <div className="profile header__profile flex w-fit min-w-0 items-center gap-8 self-center justify-self-center max-[480px]:gap-5">
        <div className="brand-mark grid size-[76px] shrink-0 place-items-center rounded-2xl max-[480px]:size-[52px] max-[480px]:rounded-[13px]">
          <img src="/images/darklogo.svg" alt="" />
        </div>
        <div className="profile__brand-copy grid min-w-0 content-center justify-items-center gap-[5px]">
          <span className="profile__welcome">Ethereum portfolio explorer</span>
          <h1><span>MyWallet</span><span className="brand-360">360</span></h1>
          <span className="profile__tagline">Wallet intelligence, simplified.</span>
        </div>
      </div>

      <div className="wallet-search-area grid min-w-0 gap-[7px] max-[899px]:col-span-full max-[899px]:row-start-2">
        <form className="global-search flex h-12 w-full items-center gap-2.5 rounded-2xl border py-0 pr-2 pl-[14px] max-[480px]:h-11 max-[480px]:pl-3" onSubmit={(event) => {
          event.preventDefault()
          onSearchSubmit()
        }}>
          <Search aria-hidden="true" />
          <input
            ref={searchInputRef}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            type="search"
            placeholder="Enter Ethereum address or ENS name..."
            aria-label="Ethereum wallet address or ENS name"
          />
          <button disabled={isSearchBusy} type="submit">
            {isResolving ? 'Resolving...' : isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
          {wallet && (
            <button
              type="button"
              className="refresh-btn"
              disabled={isRefreshing}
              title="Refresh wallet data"
              aria-label="Refresh wallet data"
              onClick={onRefreshWallet}
            >
              <RotateCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          )}
        </form>
        {searchError && <span className="wallet-search-error" role="alert">{searchError}</span>}
        {resolvedIdentifier?.type === 'ens' && !searchError && (
          <div className="wallet-resolution" aria-live="polite">
            <span>ENS</span>
            <strong title={resolvedIdentifier.originalInput}>{resolvedIdentifier.originalInput}</strong>
            <span aria-hidden="true">resolves to</span>
            <code title={resolvedIdentifier.address}>{compactAddress(resolvedIdentifier.address)}</code>
          </div>
        )}
        <div className="example-wallets flex min-w-0 items-center gap-[7px] max-[480px]:flex-col max-[480px]:items-start max-[480px]:gap-[5px]">
          <span>Try an example</span>
          <div>
            {exampleWallets.map((exampleWallet) => {
              const previewId = `wallet-preview-${exampleWallet.identifier.replace(/[^a-z0-9]/gi, '-')}`

              return (
                <div className="example-wallet" key={exampleWallet.identifier}>
                  <button
                    className={wallet && resolvedIdentifier?.originalInput === exampleWallet.identifier ? 'active' : ''}
                    disabled={isSearchBusy}
                    type="button"
                    onClick={() => onSelectExampleWallet(exampleWallet.identifier)}
                    aria-label={`Analyze ${exampleWallet.name}, ${exampleWallet.identifier}`}
                    aria-describedby={wallet ? undefined : previewId}
                  >
                    {exampleWallet.label}
                  </button>
                  {!wallet && (
                    <aside className="example-wallet-preview" id={previewId} role="tooltip">
                      <div className="example-wallet-preview__heading">
                        <span><WalletCards aria-hidden="true" /></span>
                        <div>
                          <small>{exampleWallet.type}</small>
                          <strong>{exampleWallet.name}</strong>
                        </div>
                      </div>
                      <p>{exampleWallet.description}</p>
                      <code>{exampleWallet.address}</code>
                      <div className="example-wallet-preview__details">
                        <small>Analyze to view</small>
                        <span>Balance</span>
                        <span>Portfolio</span>
                        <span>Activity</span>
                      </div>
                    </aside>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="header__actions flex min-w-0 items-center justify-end gap-2 max-[480px]:gap-[5px]">
        <div className="notification-control relative shrink-0" ref={notificationRef}>
          <button
            className={`icon-button${isNotificationPanelOpen ? ' active' : ''}`}
            type="button"
            aria-label="Notification settings"
            aria-expanded={isNotificationPanelOpen}
            aria-controls="notification-permission-panel"
            onClick={() => setIsNotificationPanelOpen((value) => !value)}
          >
            <Bell aria-hidden="true" />
            {notificationPermission !== 'granted' && <span className="notification-dot" />}
          </button>
          {isNotificationPanelOpen && (
            <aside
              className="notification-panel"
              id="notification-permission-panel"
              role="dialog"
              aria-labelledby="notification-panel-title"
            >
              <div className={`notification-panel__icon notification-panel__icon--${notificationPermission}`}>
                {notificationPermission === 'granted'
                  ? <CheckCircle2 aria-hidden="true" />
                  : <BellRing aria-hidden="true" />}
              </div>
              <div className="notification-panel__copy">
                <strong id="notification-panel-title">{notificationContent.title}</strong>
                <p>{notificationContent.description}</p>
              </div>
              <button
                className="notification-panel__close"
                type="button"
                aria-label="Close notification settings"
                onClick={() => setIsNotificationPanelOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
              {notificationPermission === 'default' && (
                <div className="notification-panel__actions">
                  <button type="button" onClick={requestNotificationPermission}>Allow notifications</button>
                  <button type="button" onClick={() => setIsNotificationPanelOpen(false)}>Not now</button>
                </div>
              )}
            </aside>
          )}
        </div>
        <button
          className="icon-button theme-toggle"
          type="button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-pressed={theme === 'dark'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
        <div className="wallet-control relative z-[110] shrink-0" ref={walletControlRef}>
          <button
            className={`wallet-pill${connectedAddress ? ' connected' : ''}`}
            type="button"
            aria-label={connectedAddress ? `Connected wallet ${connectedAddress}` : 'Connect wallet'}
            aria-expanded={isWalletPanelOpen}
            aria-controls="wallet-connection-panel"
            onClick={() => setIsWalletPanelOpen((value) => !value)}
          >
            <span className="wallet-pill__dot" />
            <span className="wallet-pill__copy">
              <strong>{connectedAddress ? 'Connected wallet' : 'Connect wallet'}</strong>
              <small>{connectedAddress ? compactAddress(connectedAddress) : 'MetaMask or browser wallet'}</small>
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
          {isWalletPanelOpen && (
            <aside
              className="wallet-connect-panel"
              id="wallet-connection-panel"
              role="dialog"
              aria-labelledby="wallet-connect-title"
            >
              <div className="wallet-connect-panel__heading">
                <span><WalletCards aria-hidden="true" /></span>
                <div>
                  <strong id="wallet-connect-title">
                    {connectedAddress ? 'Wallet connected' : 'Connect your wallet'}
                  </strong>
                  <p>
                    {connectedAddress
                      ? 'This account is connected and its analytics are loaded.'
                      : 'Choose a wallet, select an account, and approve access inside your wallet.'}
                  </p>
                </div>
              </div>

              {connectedAddress ? (
                <div className="connected-wallet-card">
                  <span className="connected-wallet-card__dot" />
                  <div>
                    <strong>{compactAddress(connectedAddress)}</strong>
                    <small>Connected account</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onDisconnectWallet()
                      setIsWalletPanelOpen(false)
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="wallet-provider-list">
                  {walletProviders.map((walletProvider) => (
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => onConnectWallet(walletProvider)}
                      key={`${walletProvider.rdns}-${walletProvider.name}`}
                    >
                      <span className="wallet-provider-icon">
                        {walletProvider.icon
                          ? <img src={walletProvider.icon} alt="" />
                          : <WalletCards aria-hidden="true" />}
                      </span>
                      <span>
                        <strong>{walletProvider.name}</strong>
                        <small>{isConnecting ? 'Check your wallet to approve...' : 'Request connection permission'}</small>
                      </span>
                      <ChevronDown aria-hidden="true" />
                    </button>
                  ))}

                  {!hasMetaMask && (
                    <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                      <span className="wallet-provider-icon wallet-provider-icon--metamask">M</span>
                      <span><strong>MetaMask</strong><small>Install MetaMask to connect</small></span>
                      <ChevronDown aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}

              {connectionError && <p className="wallet-connect-error" role="alert">{connectionError}</p>}
              <small className="wallet-connect-panel__note">
                MyWallet360 only requests your public address. It cannot access your funds.
              </small>
            </aside>
          )}
        </div>
      </div>
    </header>
  )
}
