import { Button, Chip, Spinner, Surface } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { If } from 'react-if-lite'
import { useStore } from 'valtio-define'
import { store } from '@/store'

export default function MarketPage() {
  const { t } = useTranslation()
  const { marketAlive, marketPort, statusJson, error, loading } = useStore(store.market)
  const [iframeError, setIframeError] = useState(false)

  function handleRefresh() {
    void store.market.refreshStatus()
  }

  function handleOpenBrowser() {
    const url = `http://127.0.0.1:${marketPort}/market`
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke('open_external_url', { url }))
  }

  useEffect(() => {
    void store.market.checkHealth()
    void store.market.refreshStatus()
  }, [])

  const src = `http://127.0.0.1:${marketPort}/market`

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-divider bg-content1 px-3 py-2">
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft" color={marketAlive ? 'success' : 'danger'}>
            {marketAlive ? t('market.host_alive') : t('market.host_dead')}
            {' '}
            :{marketPort}
          </Chip>
          <span className="text-xs text-default-400">3082 独立于 dsh 3080/3081 · 后端 0 改</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onPress={handleRefresh} isDisabled={loading}>
            {loading ? <Spinner size="sm" /> : null}
            {t('market.refresh')}
          </Button>
          <Button size="sm" variant="ghost" onPress={handleOpenBrowser}>
            浏览器打开
          </Button>
        </div>
      </header>

      <If cond={!!error}>
        <Surface className="m-3 rounded-lg border border-danger-200 bg-danger-50 p-3">
          <pre className="text-xs text-danger-700 whitespace-pre-wrap break-all">{error}</pre>
          <pre className="mt-2 text-xs text-default-500 whitespace-pre-wrap break-all">{statusJson ? JSON.stringify(JSON.parse(statusJson), null, 2) : ''}</pre>
        </Surface>
      </If>

      <div className="relative flex min-h-0 flex-1">
        <If cond={!iframeError} else={
          <Surface className="m-3 w-full rounded-lg border border-divider p-4">
            <p className="text-sm text-default-500">iframe 加载失败，请点“浏览器打开”或检查侧车是否就绪。</p>
            <p className="mt-2 text-xs text-default-400">src: {src}</p>
            <p className="mt-2 text-xs">API 直连测试：{statusJson ? 'status ok' : 'status pending'}</p>
          </Surface>
        }>
          <iframe
            src={src}
            title="dsh-market standalone"
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
            onError={() => setIframeError(true)}
            onLoad={() => setIframeError(false)}
          />
        </If>
      </div>
    </main>
  )
}
