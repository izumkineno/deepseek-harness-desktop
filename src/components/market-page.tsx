import { Button, Chip, Spinner, Surface } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { If } from 'react-if-lite'
import { useStore } from 'valtio-define'
import { store } from '@/store'

export default function MarketPage() {
  const { t } = useTranslation()
  const { marketAlive, marketPort, statusJson, error, loading } = useStore(store.market)
  const [registryText, setRegistryText] = useState<string | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [installedText, setInstalledText] = useState<string | null>(null)

  function formatJson(json: string | null): string {
    if (!json) return ''
    try {
      return JSON.stringify(JSON.parse(json), null, 2)
    } catch {
      return json
    }
  }

  function handleRefresh() {
    store.market.refreshStatus()
    void refreshRegistry()
    void refreshInstalled()
  }

  async function refreshRegistry() {
    setRegistryError(null)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const json = await invoke<string>('proxy_market_request', {
        path: '/dsh-market/registry',
        method: 'GET',
      })
      setRegistryText(json)
    } catch (e) {
      setRegistryError(String(e))
    }
  }

  async function refreshInstalled() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const json = await invoke<string>('proxy_market_request', {
        path: '/dsh-market/installed',
        method: 'GET',
      })
      setInstalledText(json)
    } catch {
      setInstalledText(null)
    }
  }

  useEffect(() => {
    void store.market.checkHealth()
    void store.market.refreshStatus()
    void refreshRegistry()
    void refreshInstalled()
  }, [])

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-canvas p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('market.title')}</h1>
          <p className="text-sm text-default-500">{t('market.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip
            size="sm"
            variant="soft"
            color={marketAlive ? 'success' : 'danger'}
          >
            {marketAlive ? t('market.host_alive') : t('market.host_dead')}
            {' '}
            :{marketPort}
          </Chip>
          <Button size="sm" variant="secondary" onPress={handleRefresh} isDisabled={loading}>
            {loading ? <Spinner size="sm" /> : null}
            {t('market.refresh')}
          </Button>
        </div>
      </header>

      <Surface className="rounded-lg border border-divider p-4">
        <div className="mb-2 text-sm font-medium">{t('market.status')}</div>
        <If cond={!!error}>
          <pre className="rounded bg-danger-50 p-3 text-xs text-danger-700 whitespace-pre-wrap break-all">{error}</pre>
        </If>
        <If cond={!!statusJson}>
          <pre className="max-h-[320px] overflow-auto rounded bg-default-100 p-3 text-xs whitespace-pre-wrap break-all">{formatJson(statusJson)}</pre>
        </If>
        <If cond={!statusJson && !error}>
          <p className="text-sm text-default-500">{t('market.loading')}</p>
        </If>
        <p className="mt-2 text-xs text-default-400">{t('market.host_hint')}</p>
      </Surface>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Surface className="rounded-lg border border-divider p-4">
          <div className="mb-2 text-sm font-medium">{t('market.registry')}</div>
          <If cond={!!registryError}>
            <pre className="rounded bg-danger-50 p-3 text-xs text-danger-700 whitespace-pre-wrap break-all">{registryError}</pre>
          </If>
          <If cond={!!registryText}>
            <pre className="max-h-[400px] overflow-auto rounded bg-default-100 p-3 text-xs whitespace-pre-wrap break-all">{formatJson(registryText)}</pre>
          </If>
          <If cond={!registryText && !registryError}>
            <p className="text-sm text-default-500">{t('market.loading')}</p>
          </If>
        </Surface>
        <Surface className="rounded-lg border border-divider p-4">
          <div className="mb-2 text-sm font-medium">{t('market.installed')}</div>
          <If cond={!!installedText}>
            <pre className="max-h-[400px] overflow-auto rounded bg-default-100 p-3 text-xs whitespace-pre-wrap break-all">{formatJson(installedText)}</pre>
          </If>
          <If cond={!installedText}>
            <p className="text-sm text-default-500">{t('market.loading')}</p>
          </If>
        </Surface>
      </div>

      <Surface className="rounded-lg border border-divider p-4">
        <div className="space-y-1 text-xs text-default-500">
          <p>{t('market.scheme_hint')}</p>
          <p>
            API:
            {' '}
            <code className="rounded bg-default-100 px-1">GET /dsh-market/status</code>
            {' '}
            <code className="rounded bg-default-100 px-1">GET /dsh-market/registry</code>
            {' '}
            <code className="rounded bg-default-100 px-1">GET /dsh-market/installed</code>
          </p>
        </div>
      </Surface>
    </main>
  )
}
