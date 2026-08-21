import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from 'valtio-define'
import DesktopAboutDialog from './components/desktop-about-dialog'
import DesktopUpdateDialog from './components/desktop-update-dialog'
import DesktopUpdater from './components/desktop-updater'
import DownloadToast from './components/download-toast'
import HarnessUpdater from './components/harness-updater'
import HarnessWebview from './components/harness-webview'
import MarketPage from './components/market-page'
import { useDshTheme } from './hooks/use-dsh-theme'
import { store } from './store'
import './i18n'

/**
 * 应用根组件：Harness 与独立市场双视图
 * Scheme C：市场由本项目宿主（sidecar 3082），与 dsh web(3080)隔离，dsh 崩溃时仍可用
 */
export default function App() {
  const { t } = useTranslation()
  useDshTheme()
  const { status } = useStore(store.harness)
  const { active } = useStore(store.market)

  useEffect(() => {
    store.harness.startup()
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col">
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-divider bg-content1 px-2">
        <button
          type="button"
          onClick={() => store.market.setActive(false)}
          className={`rounded px-3 py-1 text-sm ${!active ? 'bg-primary text-primary-foreground' : 'hover:bg-default-100'}`}
        >
          {t('market.tab_harness')}
        </button>
        <button
          type="button"
          onClick={() => store.market.setActive(true)}
          className={`rounded px-3 py-1 text-sm ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-default-100'}`}
        >
          {t('market.tab_market')}
        </button>
        <span className="ml-2 text-xs text-default-400">Scheme C · 宿主替换 · 3082独立</span>
      </header>
      <div className="flex min-h-0 flex-1">
        {active ? <MarketPage /> : <HarnessWebview />}
      </div>
      {status === 'ready' && !active && <HarnessUpdater />}
      {status === 'ready' && !active && <DownloadToast />}
      <DesktopUpdater />
      <DesktopUpdateDialog />
      <DesktopAboutDialog />
    </div>
  )
}
