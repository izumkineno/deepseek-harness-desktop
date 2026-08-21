import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { If } from 'react-if-lite'
import { useStore } from 'valtio-define'
import { store } from '@/store'
import MarketReuse from './market-reuse'

export default function MarketPage() {
  const { t } = useTranslation()
  const { marketAlive, marketPort } = useStore(store.market)

  useEffect(() => {
    void store.market.checkHealth()
    // 将 MarketSection 的相对 fetch 重定向到 sidecar 3082，前端通过 CSP 直连
    const origFetch = window.fetch
    const patched = (input: RequestInfo | URL, init?: RequestInit) => {
      let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (typeof url === 'string' && url.startsWith('/dsh-market/')) {
        url = `http://127.0.0.1:${marketPort}${url}`
        if (typeof input === 'string') input = url
        else if (input instanceof Request) input = new Request(url, input)
        else input = url as any
      }
      return origFetch(input as any, init)
    }
    // @ts-ignore
    window.fetch = patched as any
    return () => {
      window.fetch = origFetch
    }
  }, [marketPort])

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-divider bg-content1 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-default-500">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${marketAlive ? 'border-success-200 bg-success-50 text-success-700' : 'border-danger-200 bg-danger-50 text-danger-700'}`}>
            {marketAlive ? t('market.host_alive') : t('market.host_dead')} :{marketPort}
          </span>
          <span>复用 dsh-market 原 UI · MarketSection · 3082独立</span>
        </div>
        <div className="text-xs text-default-400">后端 0 改 · 侧车直连</div>
      </header>
      <If cond={!marketAlive} else={null}>
        <div className="p-6 text-sm text-default-500">侧车未就绪，正在启动…（独立于 dsh 3080）</div>
      </If>
      <MarketReuse />
    </main>
  )
}
